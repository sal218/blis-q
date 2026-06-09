import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Real test DB for token/audit rows; Supabase Auth, the rate limiter, and the
// email sender are mocked (deterministic CI, no real emails). Declared before
// importing the route module.
jest.mock("../supabase", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: jest.fn(),
        createUser: jest.fn(),
        deleteUser: jest.fn(),
        signOut: jest.fn(),
      },
    },
  },
  supabaseClient: {
    auth: { resend: jest.fn(), signInWithPassword: jest.fn() },
  },
}));

jest.mock("../rateLimit", () => ({
  checkSignupRateLimit: jest.fn(),
  checkLoginRateLimit: jest.fn(),
  checkResendVerificationRateLimit: jest.fn(),
  checkPasswordResetRateLimit: jest.fn(),
}));

jest.mock("../email", () => ({ sendPasswordResetEmail: jest.fn() }));

import { registerAuthRoutes } from "../routes/auth";
import { supabaseAdmin } from "../supabase";
import { checkPasswordResetRateLimit } from "../rateLimit";
import { sendPasswordResetEmail } from "../email";
import { hashResetToken } from "../auth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, auditLog, passwordResetTokens } from "@shared/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAuthRoutes(app);

const updateUserMock = supabaseAdmin.auth.admin.updateUserById as unknown as jest.Mock;
const rlMock = checkPasswordResetRateLimit as unknown as jest.Mock;
const emailMock = sendPasswordResetEmail as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-08";
const NEW_PASSWORD = "new-secret-123";
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `reset+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function seedUser(): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const email = uniqueEmail();
  await storage.registerUser({
    id,
    email,
    displayName: "Reset",
    consentTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  });
  return { id, email };
}

// Drive forgot-password and capture the raw token from the (mocked) email link.
async function requestResetToken(email: string): Promise<string> {
  emailMock.mockClear();
  await request(app).post("/api/v1/auth/forgot-password").send({ email });
  const link = emailMock.mock.calls[0][1] as string;
  return new URL(link).searchParams.get("token") as string;
}

beforeEach(() => {
  jest.clearAllMocks();
  rlMock.mockResolvedValue({ allowed: true });
  emailMock.mockResolvedValue(undefined);
  updateUserMock.mockResolvedValue({ data: { user: {} }, error: null });
});

afterEach(async () => {
  for (const id of createdUserIds) {
    await db.delete(auditLog).where(eq(auditLog.actorId, id));
    await db.delete(users).where(eq(users.id, id)); // cascades tokens + consent + prefs
  }
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("existing, non-deleted → 202, stores a HASHED token, sends email", async () => {
    const { id, email } = await seedUser();

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(emailMock).toHaveBeenCalledTimes(1);
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex, never raw
    expect(tokens[0].usedAt).toBeNull();
  });

  it("non-existent email → identical 202, nothing stored or sent", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(emailMock).not.toHaveBeenCalled();
  });

  it("deleted account → identical 202, nothing stored or sent", async () => {
    const { id, email } = await seedUser();
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email });

    expect(res.status).toBe(202);
    expect(emailMock).not.toHaveBeenCalled();
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, id));
    expect(tokens).toHaveLength(0);
  });

  it("rate-limited → 429", async () => {
    rlMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: uniqueEmail() });
    expect(res.status).toBe(429);
  });
});

describe("POST /api/v1/auth/reset-password", () => {
  it("valid token → 200, updates password, marks token used, audits", async () => {
    const { id, email } = await seedUser();
    const token = await requestResetToken(email);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(updateUserMock).toHaveBeenCalledWith(id, { password: NEW_PASSWORD });
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, id));
    expect(tokens[0].usedAt).not.toBeNull();
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "user.password_reset")).toBe(true);
  });

  it("invalid token → 400 generic, no password change", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "not-a-real-token", newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("expired token → 400", async () => {
    const { id } = await seedUser();
    const raw = "expired-token-raw-value";
    await storage.createPasswordResetToken({
      userId: id,
      tokenHash: hashResetToken(raw),
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: raw, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("already-used token → 400 (single-use)", async () => {
    const { email } = await seedUser();
    const token = await requestResetToken(email);
    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: NEW_PASSWORD }); // first use
    updateUserMock.mockClear();

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: NEW_PASSWORD }); // reuse

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("two parallel resets with the same token → only one updates the password", async () => {
    const { email } = await seedUser();
    const token = await requestResetToken(email);

    const [a, b] = await Promise.all([
      request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: NEW_PASSWORD }),
      request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token, newPassword: NEW_PASSWORD }),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([200, 400]); // exactly one winner
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it("token for a now-soft-deleted account → 400, no password change", async () => {
    const { id, email } = await seedUser();
    const token = await requestResetToken(email);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("requesting a new reset invalidates the previous token", async () => {
    const { email } = await seedUser();
    const token1 = await requestResetToken(email);
    const token2 = await requestResetToken(email);

    const first = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: token1, newPassword: NEW_PASSWORD });
    expect(first.status).toBe(400); // old token was invalidated

    const second = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: token2, newPassword: NEW_PASSWORD });
    expect(second.status).toBe(200);
  });

  it("rate-limited → 429", async () => {
    rlMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: "x", newPassword: NEW_PASSWORD });
    expect(res.status).toBe(429);
  });
});
