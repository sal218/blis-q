import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Authenticated-route tests: mock ONLY the isAuthenticated middleware to inject
// a req.user (the verified-JWT step isn't worth wiring against real Supabase in
// CI). Everything else is real — storage runs against the test DB; Supabase
// admin/client and the rate limiter are mocked like the auth tests. `mockUser`
// is mutated per test (the `mock` prefix lets the jest factory reference it).
let mockUser: { id: string } | null = null;
jest.mock("../auth", () => {
  const actual = jest.requireActual("../auth");
  return {
    ...actual,
    isAuthenticated: (
      req: { user?: { id: string } },
      res: { status(code: number): { json(body: unknown): void } },
      next: () => void,
    ) => {
      if (!mockUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.user = mockUser;
      next();
    },
  };
});

jest.mock("../supabase", () => ({
  supabaseAdmin: {
    auth: { admin: { updateUserById: jest.fn(), signOut: jest.fn() } },
  },
  supabaseClient: {
    auth: { signInWithPassword: jest.fn() },
  },
}));

jest.mock("../rateLimit", () => ({
  checkAccountUpdateRateLimit: jest.fn(),
  checkChangePasswordRateLimit: jest.fn(),
}));

import { registerAccountRoutes } from "../routes/account";
import { supabaseClient, supabaseAdmin } from "../supabase";
import {
  checkAccountUpdateRateLimit,
  checkChangePasswordRateLimit,
} from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAccountRoutes(app);

const signInMock =
  supabaseClient.auth.signInWithPassword as unknown as jest.Mock;
const updateUserByIdMock =
  supabaseAdmin.auth.admin.updateUserById as unknown as jest.Mock;
const signOutMock = supabaseAdmin.auth.admin.signOut as unknown as jest.Mock;
const acctRl = checkAccountUpdateRateLimit as unknown as jest.Mock;
const pwRl = checkChangePasswordRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `acct+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function seedUser(): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const email = uniqueEmail();
  await storage.registerUser({
    id,
    email,
    displayName: "Tester",
    consentTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  });
  return { id, email };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  acctRl.mockResolvedValue({ allowed: true });
  pwRl.mockResolvedValue({ allowed: true });
  signOutMock.mockResolvedValue({ data: {}, error: null });
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
});

afterEach(async () => {
  for (const id of createdUserIds) {
    await db.delete(auditLog).where(eq(auditLog.actorId, id));
    await db.delete(users).where(eq(users.id, id)); // cascades consents + prefs
  }
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/profile", () => {
  it("authenticated → 200 AccountProfile for the caller", async () => {
    const { id, email } = await seedUser();
    mockUser = { id };

    const res = await request(app).get("/api/v1/profile");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.email).toBe(email);
    expect(res.body.displayName).toBe("Tester");
    expect(res.body.isAdmin).toBe(false);
  });

  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app).get("/api/v1/profile");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/v1/profile", () => {
  it("updates displayName + preferredCity, invalidates cache, audits", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    const res = await request(app)
      .patch("/api/v1/profile")
      .send({ displayName: "Nowe Imię", preferredCity: "Warszawa" });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Nowe Imię");
    expect(res.body.preferredCity).toBe("Warszawa");

    // Persisted, and re-readable via the storage projection (cache path).
    const profile = await storage.getAccountProfile(id);
    expect(profile?.displayName).toBe("Nowe Imię");
    expect(profile?.preferredCity).toBe("Warszawa");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "user.profile_updated")).toBe(true);
  });

  it("trims whitespace on displayName", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    await request(app)
      .patch("/api/v1/profile")
      .send({ displayName: "   Ola   " });

    const profile = await storage.getAccountProfile(id);
    expect(profile?.displayName).toBe("Ola");
  });

  it("empty body → 400 (must change something)", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    const res = await request(app).patch("/api/v1/profile").send({});
    expect(res.status).toBe(400);
  });

  it("avatarKey is rejected (deferred until R2) → 400", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    const res = await request(app)
      .patch("/api/v1/profile")
      .send({ displayName: "Ola", avatarKey: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    acctRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .patch("/api/v1/profile")
      .send({ displayName: "Ola" });
    expect(res.status).toBe(429);
  });
});

describe("POST /api/v1/account/change-password", () => {
  it("wrong current password → generic 401 + password_change_failed audit", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    signInMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await request(app)
      .post("/api/v1/account/change-password")
      .send({ currentPassword: "wrong", newPassword: "newsupersecret" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "user.password_change_failed")).toBe(
      true,
    );
  });

  it("correct current password → 200, updates password, REVOKES sessions, audits", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    signInMock.mockResolvedValue({
      data: { session: { access_token: "verify-token" } },
      error: null,
    });

    const res = await request(app)
      .post("/api/v1/account/change-password")
      .send({ currentPassword: "supersecret", newPassword: "newsupersecret" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith(id, {
      password: "newsupersecret",
    });
    // The verification session (and the user's other sessions) are revoked.
    expect(signOutMock).toHaveBeenCalledWith("verify-token", "global");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "user.password_changed")).toBe(true);
  });

  it("rate-limited → 429, Supabase never called", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    pwRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await request(app)
      .post("/api/v1/account/change-password")
      .send({ currentPassword: "supersecret", newPassword: "newsupersecret" });

    expect(res.status).toBe(429);
    expect(signInMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/account/consents", () => {
  it("returns the user's consent records (active + withdrawn)", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    const res = await request(app).get("/api/v1/account/consents");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].consentType).toBe("account_creation");
    expect(res.body[0].policyVersion).toBe(POLICY_VERSION);
    expect(res.body[0].withdrawnAt).toBeNull();
  });
});
