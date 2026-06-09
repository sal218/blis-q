import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Mock the Supabase Auth boundary and the rate limiter. The Google sign-in flow
// is Option A (supabaseClient.auth.signInWithIdToken exchanges a Google ID token
// for a Supabase session). We simulate that exchange and exercise OUR logic —
// find-or-create, consent enforcement on first sign-up, orphan/rollback cleanup,
// soft-deleted blocking, generic failure, rate limiting — against the REAL test
// DB. Declared before importing the route module.
jest.mock("../supabase", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: jest.fn(),
        signOut: jest.fn(),
      },
    },
  },
  supabaseClient: {
    auth: { signInWithIdToken: jest.fn() },
  },
}));

jest.mock("../rateLimit", () => ({
  checkGoogleAuthRateLimit: jest.fn(),
}));

import { registerAuthRoutes } from "../routes/auth";
import { supabaseAdmin, supabaseClient } from "../supabase";
import { checkGoogleAuthRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, consentRecords, auditLog } from "@shared/schema";
import { eq } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAuthRoutes(app);

const signInIdTokenMock =
  supabaseClient.auth.signInWithIdToken as unknown as jest.Mock;
const deleteUserMock =
  supabaseAdmin.auth.admin.deleteUser as unknown as jest.Mock;
const signOutMock = supabaseAdmin.auth.admin.signOut as unknown as jest.Mock;
const googleRl = checkGoogleAuthRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-08";
const ID_TOKEN = "google-id-token";
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `gtest+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const VALID_SESSION = {
  access_token: "at",
  refresh_token: "rt",
  expires_at: 1900000000,
};

// What signInWithIdToken returns once Supabase has verified the Google token.
function googleSession(
  id: string,
  email: string,
  metadata: Record<string, unknown> = { full_name: "Google User" },
) {
  return {
    data: {
      user: { id, email, user_metadata: metadata },
      session: VALID_SESSION,
    },
    error: null,
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

beforeEach(() => {
  jest.clearAllMocks();
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  signOutMock.mockResolvedValue({ data: {}, error: null });
  googleRl.mockResolvedValue({ allowed: true });
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

describe("POST /api/v1/auth/google", () => {
  it("new user WITH consent → 200 session, local rows created", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    const email = uniqueEmail();
    signInIdTokenMock.mockResolvedValue(googleSession(id, email));

    const res = await request(app).post("/api/v1/auth/google").send({
      idToken: ID_TOKEN,
      consentedTypes: ["account_creation"],
      policyVersion: POLICY_VERSION,
    });

    expect(res.status).toBe(200);
    expect(res.body.session.accessToken).toBe("at");
    expect(res.body.user.id).toBe(id);
    expect(res.body.user.displayName).toBe("Google User");

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user?.email).toBe(email);
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, id));
    expect(consents).toHaveLength(1);
    const prefs = await storage.getNotificationPreferences(id);
    expect(prefs.communityPosts).toBe(true);
    // No orphan cleanup on the success path.
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("new user WITHOUT consent → 422 consent_required, orphan auth user deleted, no rows", async () => {
    const id = randomUUID();
    const email = uniqueEmail();
    signInIdTokenMock.mockResolvedValue(googleSession(id, email));

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: ID_TOKEN });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "consent_required" });
    expect(res.body.session).toBeUndefined();
    // The auth user the exchange created is deleted — no orphan identity.
    expect(deleteUserMock).toHaveBeenCalledWith(id);
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returning user → 200 session, no consent needed, no duplicate rows", async () => {
    const { id, email } = await seedUser();
    signInIdTokenMock.mockResolvedValue(googleSession(id, email));

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: ID_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(id);
    // Existing displayName is preserved — not overwritten by the Google name.
    expect(res.body.user.displayName).toBe("Tester");
    expect(deleteUserMock).not.toHaveBeenCalled();
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, id));
    expect(consents).toHaveLength(1);
  });

  it("soft-deleted account → 401, revokes the Supabase session, no auth-user delete", async () => {
    const { id, email } = await seedUser();
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id));
    signInIdTokenMock.mockResolvedValue(googleSession(id, email));

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: ID_TOKEN });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(res.body.session).toBeUndefined();
    // Session revoked, but the real (soft-deleted) account is NOT hard-deleted.
    expect(signOutMock).toHaveBeenCalledWith("at", "global");
    expect(deleteUserMock).not.toHaveBeenCalled();
    const failures = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(failures.some((f) => f.action === "user.login_failed")).toBe(true);
  });

  it("invalid / forged token → generic 401 + login_failed audit", async () => {
    signInIdTokenMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid token" },
    });

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "bogus" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(deleteUserMock).not.toHaveBeenCalled();
    const failures = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.login_failed"));
    expect(failures.length).toBeGreaterThanOrEqual(1);
  });

  it("rate-limited → 429, token exchange never attempted", async () => {
    googleRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: ID_TOKEN });

    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBe(60);
    expect(signInIdTokenMock).not.toHaveBeenCalled();
  });

  it("DB failure after token exchange rolls back the auth user", async () => {
    const id = randomUUID();
    const email = uniqueEmail();
    signInIdTokenMock.mockResolvedValue(googleSession(id, email));
    const spy = jest
      .spyOn(storage, "registerUser")
      .mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/api/v1/auth/google").send({
      idToken: ID_TOKEN,
      consentedTypes: ["account_creation"],
      policyVersion: POLICY_VERSION,
    });

    expect(res.status).toBe(500);
    expect(deleteUserMock).toHaveBeenCalledWith(id);
    const rows = await db.select().from(users).where(eq(users.id, id));
    expect(rows).toHaveLength(0);
    spy.mockRestore();
  });
});
