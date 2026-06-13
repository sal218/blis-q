import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests (same pattern as the account suites):
// mock only isAuthenticated to inject req.user; storage runs against the test DB.
// Minimal ../auth mock (no requireActual) to avoid the auth→storage→auth circular
// load. Rate limiters + supabase (loaded via routes/auth for safeErrorCode) are
// mocked so nothing hits the network.
let mockUser: { id: string } | null = null;
jest.mock("../auth", () => ({
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
  invalidateProfileCache: jest.fn().mockResolvedValue(undefined),
  generateResetToken: () => "stub",
  hashResetToken: () => "stub",
}));

jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkCommunityCreateRateLimit: jest.fn(),
  checkCommunityJoinRateLimit: jest.fn(),
}));

import { registerCommunityRoutes } from "../routes/communities";
import {
  checkCommunityCreateRateLimit,
  checkCommunityJoinRateLimit,
} from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import {
  users,
  communities,
  communityMemberships,
  auditLog,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerCommunityRoutes(app);

jest.setTimeout(30000);

const createRl = checkCommunityCreateRateLimit as unknown as jest.Mock;
const joinRl = checkCommunityJoinRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `com+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  createdUserIds.push(id);
  await storage.registerUser({
    id,
    email: uniqueEmail(),
    displayName: "Tester",
    consentTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  });
  return id;
}

async function seedCommunity(creatorId: string, name: string): Promise<string> {
  const c = await storage.createCommunity({ name, creatorId });
  createdCommunityIds.push(c.id);
  return c.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  createRl.mockResolvedValue({ allowed: true });
  joinRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdCommunityIds.length) {
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds)); // cascades memberships
  }
  if (createdUserIds.length) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
  createdCommunityIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/communities", () => {
  it("creates a community, makes the creator admin, audits", async () => {
    const id = await seedUser();
    mockUser = { id };

    const res = await request(app)
      .post("/api/v1/communities")
      .send({ name: "Tęczowa Społeczność", description: "opis" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Tęczowa Społeczność");
    expect(res.body.memberCount).toBe(1);
    expect(res.body.membership).toEqual({ role: "admin" });
    createdCommunityIds.push(res.body.id);

    // Creator membership exists with admin role.
    const [m] = await db
      .select()
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, res.body.id));
    expect(m.userId).toBe(id);
    expect(m.role).toBe("admin");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "community.created")).toBe(true);
  });

  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app)
      .post("/api/v1/communities")
      .send({ name: "X" });
    expect(res.status).toBe(401);
  });

  it("empty name → 400", async () => {
    const id = await seedUser();
    mockUser = { id };
    const res = await request(app)
      .post("/api/v1/communities")
      .send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const id = await seedUser();
    mockUser = { id };
    createRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/v1/communities")
      .send({ name: "X" });
    expect(res.status).toBe(429);
  });
});

describe("GET /api/v1/communities", () => {
  it("lists communities with memberCount + caller role, supports search", async () => {
    const id = await seedUser();
    const tokenA = `Alpha${Math.random().toString(36).slice(2, 7)}`;
    const tokenB = `Beta${Math.random().toString(36).slice(2, 7)}`;
    const idA = await seedCommunity(id, tokenA);
    const idB = await seedCommunity(id, tokenB);
    mockUser = { id };

    const all = await request(app).get("/api/v1/communities");
    expect(all.status).toBe(200);
    const ids = all.body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    const a = all.body.data.find((c: { id: string }) => c.id === idA);
    expect(a.memberCount).toBe(1);
    expect(a.membership).toEqual({ role: "admin" });

    const searched = await request(app).get(
      `/api/v1/communities?search=${tokenA}`,
    );
    const sIds = searched.body.data.map((c: { id: string }) => c.id);
    expect(sIds).toContain(idA);
    expect(sIds).not.toContain(idB);
  });
});

describe("GET /api/v1/communities/:id", () => {
  it("returns the community with membership; 404 missing; 400 bad id", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Detal");
    mockUser = { id };

    const ok = await request(app).get(`/api/v1/communities/${cid}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(cid);
    expect(ok.body.membership).toEqual({ role: "admin" });
    expect(ok.body.memberCount).toBe(1);

    const missing = await request(app).get(
      `/api/v1/communities/${randomUUID()}`,
    );
    expect(missing.status).toBe(404);

    const bad = await request(app).get("/api/v1/communities/not-a-uuid");
    expect(bad.status).toBe(400);
  });
});

describe("POST /api/v1/communities/:id/join", () => {
  it("joins as member; duplicate → 409; missing community → 404; audits", async () => {
    const owner = await seedUser();
    const joiner = await seedUser();
    const cid = await seedCommunity(owner, "Dołącz");

    mockUser = { id: joiner };
    const joined = await request(app).post(`/api/v1/communities/${cid}/join`);
    expect(joined.status).toBe(200);
    expect(joined.body).toEqual({ role: "member" });

    const again = await request(app).post(`/api/v1/communities/${cid}/join`);
    expect(again.status).toBe(409);

    const missing = await request(app).post(
      `/api/v1/communities/${randomUUID()}/join`,
    );
    expect(missing.status).toBe(404);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, joiner));
    expect(audits.some((a) => a.action === "community.member_joined")).toBe(
      true,
    );
  });

  it("rate-limited → 429", async () => {
    const owner = await seedUser();
    const joiner = await seedUser();
    const cid = await seedCommunity(owner, "Limit");
    mockUser = { id: joiner };
    joinRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).post(`/api/v1/communities/${cid}/join`);
    expect(res.status).toBe(429);
  });
});

describe("DELETE /api/v1/communities/:id/leave", () => {
  it("removes the membership and audits", async () => {
    const owner = await seedUser();
    const joiner = await seedUser();
    const cid = await seedCommunity(owner, "Opuść");
    mockUser = { id: joiner };
    await request(app).post(`/api/v1/communities/${cid}/join`);

    const res = await request(app).delete(`/api/v1/communities/${cid}/leave`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(communityMemberships)
      .where(eq(communityMemberships.userId, joiner));
    expect(rows).toHaveLength(0);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, joiner));
    expect(audits.some((a) => a.action === "community.member_left")).toBe(true);
  });

  it("sole admin cannot leave → 409 (community keeps ≥1 admin)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner, "Sam Admin");
    mockUser = { id: owner };

    const res = await request(app).delete(`/api/v1/communities/${cid}/leave`);
    expect(res.status).toBe(409);

    // Still a member (admin) — nothing removed.
    const rows = await db
      .select()
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, cid));
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
  });

  it("an admin CAN leave when another admin remains → 200", async () => {
    const owner = await seedUser();
    const second = await seedUser();
    const cid = await seedCommunity(owner, "Dwóch Adminów");
    // Promote the second user to admin directly (role management is a later slice).
    await db
      .insert(communityMemberships)
      .values({ communityId: cid, userId: second, role: "admin" });

    mockUser = { id: owner };
    const res = await request(app).delete(`/api/v1/communities/${cid}/leave`);
    expect(res.status).toBe(200);

    // Owner gone; the second admin remains.
    const remaining = await db
      .select()
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, cid));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(second);
  });
});
