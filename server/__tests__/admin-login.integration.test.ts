import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Mock the Supabase Auth boundary and the admin rate limiter. Tests exercise OUR
// logic — the server-side isAdmin gate, session revocation for non-admins, the
// uniform generic 401, and audit writes — against the REAL test DB, with
// Supabase's responses simulated.
jest.mock("../supabase", () => ({
  supabaseAdmin: {
    auth: { admin: { signOut: jest.fn() } },
  },
  supabaseClient: {
    auth: { signInWithPassword: jest.fn() },
  },
}));

jest.mock("../rateLimit", () => ({
  checkAdminLoginRateLimit: jest.fn(),
}));

import { registerAdminRoutes } from "../routes/admin";
import { supabaseClient, supabaseAdmin } from "../supabase";
import { checkAdminLoginRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAdminRoutes(app);

const signInMock = supabaseClient.auth
  .signInWithPassword as unknown as jest.Mock;
const signOutMock = supabaseAdmin.auth.admin.signOut as unknown as jest.Mock;
const rlMock = checkAdminLoginRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const PASSWORD = "supersecret123";
const createdUserIds: string[] = [];
const VALID_SESSION = {
  access_token: "at",
  refresh_token: "rt",
  expires_at: 1900000000,
};

function uniqueEmail(): string {
  return `admin+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function seedUser(
  opts: { isAdmin?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  createdUserIds.push(id);
  const email = uniqueEmail();
  await storage.registerUser({
    id,
    email,
    displayName: "Admin",
    consentTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  });
  if (opts.isAdmin) {
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, id));
  }
  return { id, email };
}

beforeEach(() => {
  jest.clearAllMocks();
  signOutMock.mockResolvedValue({ data: {}, error: null });
  rlMock.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  for (const id of createdUserIds) {
    await db.delete(auditLog).where(eq(auditLog.actorId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  createdUserIds.length = 0;
  await db.delete(auditLog).where(eq(auditLog.action, "admin.login_failed"));
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/admin/login", () => {
  it("verified admin + correct password → 200 SessionResponse + admin.login audit", async () => {
    const { id, email } = await seedUser({ isAdmin: true });
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.session.accessToken).toBe("at");
    expect(res.body.user.id).toBe(id);
    expect(res.body.user.isAdmin).toBe(true);
    expect(signOutMock).not.toHaveBeenCalled();

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "admin.login")).toBe(true);
  });

  it("non-admin + correct password → generic 401, session revoked, admin.login_failed", async () => {
    const { id, email } = await seedUser({ isAdmin: false });
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(res.body.session).toBeUndefined();
    // The session Supabase issued is revoked so a non-admin never holds one.
    expect(signOutMock).toHaveBeenCalledWith("at", "global");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "admin.login_failed")).toBe(true);
    expect(audits.some((a) => a.action === "admin.login")).toBe(false);
  });

  it("non-admin AND session revocation fails → still generic 401, no session body, audit written", async () => {
    const { id, email } = await seedUser({ isAdmin: false });
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });
    // Supabase revocation fails — the route must fail safe: still 401, audited,
    // and obviously no session in the body (it was never returned anyway).
    signOutMock.mockRejectedValueOnce(new Error("revoke boom"));

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(res.body.session).toBeUndefined();
    expect(signOutMock).toHaveBeenCalledWith("at", "global");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "admin.login_failed")).toBe(true);
  });

  it("bad credentials → generic 401 + admin.login_failed (no session issued)", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: uniqueEmail(), password: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(signOutMock).not.toHaveBeenCalled();
    const failures = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "admin.login_failed"));
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("unverified email → generic 401 (Supabase rejects 'Email not confirmed')", async () => {
    signInMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: uniqueEmail(), password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("soft-deleted admin → generic 401, session revoked, admin.login_failed", async () => {
    const { id, email } = await seedUser({ isAdmin: true });
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
    signInMock.mockResolvedValue({
      data: { user: { id }, session: VALID_SESSION },
      error: null,
    });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(signOutMock).toHaveBeenCalledWith("at", "global");
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "admin.login_failed")).toBe(true);
  });

  it("rate-limited → 429, Supabase never called", async () => {
    rlMock.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: uniqueEmail(), password: PASSWORD });

    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBe(60);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("invalid input (missing password) → 400, Supabase never called", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(400);
    expect(signInMock).not.toHaveBeenCalled();
  });
});
