import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Mock the Supabase Auth boundary and the rate limiter. The tests exercise OUR
// logic (uniform 202, no session, consent enforcement, row creation, rollback,
// generic login failures, audit writes, session revocation) against the REAL
// test DB, with Supabase's network responses simulated. This keeps CI
// deterministic and avoids Supabase free-tier email rate limits. Declared
// before importing the route module.
jest.mock("../supabase", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
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
}));

import { registerAuthRoutes } from "../routes/auth";
import { supabaseAdmin, supabaseClient } from "../supabase";
import {
  checkSignupRateLimit,
  checkLoginRateLimit,
  checkResendVerificationRateLimit,
} from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, consentRecords, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAuthRoutes(app);

const createUserMock = supabaseAdmin.auth.admin
  .createUser as unknown as jest.Mock;
const deleteUserMock = supabaseAdmin.auth.admin
  .deleteUser as unknown as jest.Mock;
const signOutMock = supabaseAdmin.auth.admin.signOut as unknown as jest.Mock;
const resendMock = supabaseClient.auth.resend as unknown as jest.Mock;
const signInMock = supabaseClient.auth
  .signInWithPassword as unknown as jest.Mock;
const signupRl = checkSignupRateLimit as unknown as jest.Mock;
const loginRl = checkLoginRateLimit as unknown as jest.Mock;
const resendRl = checkResendVerificationRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-08";
const PASSWORD = "supersecret123";
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `test+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function validSignup(email: string) {
  return {
    email,
    password: PASSWORD,
    displayName: "Tester",
    consentedTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  };
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

const VALID_SESSION = {
  access_token: "at",
  refresh_token: "rt",
  expires_at: 1900000000,
};

beforeEach(() => {
  jest.clearAllMocks();
  resendMock.mockResolvedValue({ data: {}, error: null });
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  signOutMock.mockResolvedValue({ data: {}, error: null });
  signupRl.mockResolvedValue({ allowed: true });
  loginRl.mockResolvedValue({ allowed: true });
  resendRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  for (const id of createdUserIds) {
    await db.delete(auditLog).where(eq(auditLog.actorId, id));
    await db.delete(users).where(eq(users.id, id)); // cascades consent + prefs
  }
  createdUserIds.length = 0;
  await db.delete(auditLog).where(eq(auditLog.action, "user.login_failed"));
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/auth/signup", () => {
  it("new email → 202 { ok: true }, no session, rows created", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    createUserMock.mockResolvedValue({ data: { user: { id } }, error: null });
    const email = uniqueEmail();

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send(validSignup(email));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(res.body.session).toBeUndefined();

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user?.email).toBe(email);
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, id));
    expect(consents).toHaveLength(1);
    const prefs = await storage.getNotificationPreferences(id);
    expect(prefs.communityPosts).toBe(true);
    // Verification email is sent only AFTER the DB tx succeeds.
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email });
  });

  it("existing email → identical 202, no new auth user, no duplicate rows", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    createUserMock.mockResolvedValue({ data: { user: { id } }, error: null });
    const email = uniqueEmail();

    await request(app).post("/api/v1/auth/signup").send(validSignup(email));
    createUserMock.mockClear();
    resendMock.mockClear();

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send(validSignup(email));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(resendMock).not.toHaveBeenCalled();
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, id));
    expect(consents).toHaveLength(1);
  });

  it("consent without account_creation → 400, no auth user created", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ ...validSignup(uniqueEmail()), consentedTypes: ["analytics"] });

    expect(res.status).toBe(400);
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("duplicate consent values are deduped → exactly one consent_records row", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    createUserMock.mockResolvedValue({ data: { user: { id } }, error: null });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        ...validSignup(uniqueEmail()),
        consentedTypes: ["account_creation", "account_creation"],
      });

    expect(res.status).toBe(202);
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, id));
    expect(consents).toHaveLength(1);
  });

  it("DB failure after auth user creation rolls back the auth user", async () => {
    const id = randomUUID();
    createUserMock.mockResolvedValue({ data: { user: { id } }, error: null });
    const spy = jest
      .spyOn(storage, "registerUser")
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send(validSignup(uniqueEmail()));

    expect(res.status).toBe(500);
    expect(deleteUserMock).toHaveBeenCalledWith(id);
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(0);
    spy.mockRestore();
  });
});

describe("POST /api/v1/auth/resend-verification", () => {
  it("existing, non-deleted email → 202 and resend is sent", async () => {
    const { email } = await seedUser();
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email });
  });

  it("non-existent email → identical 202, nothing sent (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("deleted account → identical 202, nothing sent", async () => {
    const { id, email } = await seedUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));

    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email });

    expect(res.status).toBe(202);
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("rate-limited → 429", async () => {
    resendRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/v1/auth/resend-verification")
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBe(60);
  });
});

describe("POST /api/v1/auth/login", () => {
  it("verified, non-deleted user → 200 with session", async () => {
    const { id, email } = await seedUser();
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.session.accessToken).toBe("at");
    expect(res.body.user.id).toBe(id);
    expect(res.body.user.displayName).toBe("Tester");
  });

  it("unverified / bad credentials → generic 401 + login_failed audit", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail(), password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(res.body.session).toBeUndefined();
    const failures = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.login_failed"));
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("soft-deleted account → 401, revokes the Supabase session, audits with actorId", async () => {
    const { id, email } = await seedUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(401);
    // Supabase session is revoked so it can't be used out-of-band.
    expect(signOutMock).toHaveBeenCalledWith("at", "global");
    // Blocked attempt is audited with the actor id.
    const failures = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(failures.some((f) => f.action === "user.login_failed")).toBe(true);
  });

  it("banned account → 403 account_suspended, revokes the session, audits, no DTO leak", async () => {
    const { id, email } = await seedUser();
    await db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.id, id));
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });

    // Valid credentials, but suspended → 403 with the stable client code.
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: "Account suspended",
      code: "account_suspended",
    });
    // No session is handed back, and bannedAt never leaks to the client.
    expect(res.body.session).toBeUndefined();
    expect(res.body.user).toBeUndefined();
    // The just-issued Supabase session is revoked so it can't be used out-of-band.
    expect(signOutMock).toHaveBeenCalledWith("at", "global");
    // Blocked attempt is audited with the actor id (IDs only).
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(
      audits.some((a) => a.action === "user.login_blocked_suspended"),
    ).toBe(true);
  });
});
