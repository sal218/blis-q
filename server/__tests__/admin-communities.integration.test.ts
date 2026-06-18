import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests (same pattern as communities suite).
// Mock isAuthenticated to inject req.user and requireAdmin to gate on isAdmin —
// both come from the injected mockUser so we can simulate non-admins. Storage
// runs against the test DB; supabase + rate limiters are mocked (no network).
let mockUser: { id: string; isAdmin: boolean } | null = null;
jest.mock("../auth", () => ({
  isAuthenticated: (
    req: { user?: { id: string; isAdmin: boolean } },
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
  requireAdmin: (
    req: { user?: { isAdmin?: boolean } },
    res: { status(code: number): { json(body: unknown): void } },
    next: () => void,
  ) => {
    if (!req.user?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
  invalidateProfileCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkAdminLoginRateLimit: jest.fn(),
  checkAdminMutationRateLimit: jest.fn(),
}));

import { registerAdminRoutes } from "../routes/admin";
import { checkAdminMutationRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, communities, auditLog, reports } from "@shared/schema";
import { inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `adm+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
  mutationRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
  }
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

describe("admin gating", () => {
  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app).get("/api/admin/communities");
    expect(res.status).toBe(401);
  });

  it("authenticated non-admin → 403", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: false };
    const res = await request(app).get("/api/admin/communities");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/communities", () => {
  it("creates a community (admin becomes admin member), audits", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/communities")
      .send({ name: "  Panel Społeczność  ", description: "  opis  " });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Panel Społeczność"); // trimmed server-side
    expect(res.body.memberCount).toBe(1);
    expect(res.body.membership).toEqual({ role: "admin" });
    createdCommunityIds.push(res.body.id);

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [id]));
    expect(audits.some((a) => a.action === "community.created")).toBe(true);
  });

  it("whitespace-only name → 400", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: true };
    const res = await request(app)
      .post("/api/admin/communities")
      .send({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/admin/communities")
      .send({ name: "X" });
    expect(res.status).toBe(429);
  });
});

describe("GET /api/admin/communities", () => {
  it("lists communities with memberCount + search", async () => {
    const id = await seedUser();
    const tokenA = `Adm${Math.random().toString(36).slice(2, 7)}`;
    const idA = await seedCommunity(id, tokenA);
    const idB = await seedCommunity(
      id,
      `Other${Math.random().toString(36).slice(2, 6)}`,
    );
    mockUser = { id, isAdmin: true };

    const all = await request(app).get("/api/admin/communities");
    expect(all.status).toBe(200);
    const ids = all.body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    const a = all.body.data.find((c: { id: string }) => c.id === idA);
    expect(a.memberCount).toBe(1);

    const searched = await request(app).get(
      `/api/admin/communities?search=${tokenA}`,
    );
    const sIds = searched.body.data.map((c: { id: string }) => c.id);
    expect(sIds).toContain(idA);
    expect(sIds).not.toContain(idB);
  });
});

describe("GET /api/admin/communities/:id", () => {
  it("200 found; 404 missing; 400 bad id", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Detal");
    mockUser = { id, isAdmin: true };

    const ok = await request(app).get(`/api/admin/communities/${cid}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(cid);

    const missing = await request(app).get(
      `/api/admin/communities/${randomUUID()}`,
    );
    expect(missing.status).toBe(404);

    const bad = await request(app).get("/api/admin/communities/not-a-uuid");
    expect(bad.status).toBe(400);
  });
});

describe("PATCH /api/admin/communities/:id", () => {
  it("updates name/description (trimmed) and audits", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Stara Nazwa");
    mockUser = { id, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/communities/${cid}`)
      .send({ name: "  Nowa Nazwa  " });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Nowa Nazwa");

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [id]));
    expect(audits.some((a) => a.action === "community.updated")).toBe(true);
  });

  it("empty body → 400", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Bez Zmian");
    mockUser = { id, isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/communities/${cid}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("whitespace-only name → 400", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Spacja");
    mockUser = { id, isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/communities/${cid}`)
      .send({ name: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects imageKey (R2 deferred) → 400", async () => {
    const id = await seedUser();
    const cid = await seedCommunity(id, "Obraz");
    mockUser = { id, isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/communities/${cid}`)
      .send({ name: "OK", imageKey: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("404 for a missing community", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/communities/${randomUUID()}`)
      .send({ name: "Nope" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/communities/:id (soft delete)", () => {
  it("soft-deletes and the community disappears from public list/detail/join", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const cid = await seedCommunity(owner, "Do Usunięcia");
    mockUser = { id: owner, isAdmin: true };

    const del = await request(app).delete(`/api/admin/communities/${cid}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // Public surfaces (storage layer that the public routes wrap) must not see it.
    const list = await storage.listCommunities({
      offset: 0,
      limit: 50,
      callerId: owner,
    });
    expect(list.rows.map((c) => c.id)).not.toContain(cid);
    expect(await storage.getCommunity(cid, owner)).toBeNull();
    expect(await storage.joinCommunity(cid, other)).toBe("not_found");

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [owner]));
    expect(audits.some((a) => a.action === "community.deleted")).toBe(true);
  });

  it("404 when already deleted / missing", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner, "Znika");
    mockUser = { id: owner, isAdmin: true };

    expect(
      (await request(app).delete(`/api/admin/communities/${cid}`)).status,
    ).toBe(200);
    // Second delete → already gone → 404.
    expect(
      (await request(app).delete(`/api/admin/communities/${cid}`)).status,
    ).toBe(404);
  });
});

describe("GET /api/admin/reports", () => {
  it("lists reports and filters by status", async () => {
    const reporter = await seedUser();
    await storage.submitReport(reporter, {
      resourceType: "community",
      resourceId: randomUUID(),
      reason: "spam",
    });
    mockUser = { id: await seedUser(), isAdmin: true };

    const all = await request(app).get("/api/admin/reports");
    expect(all.status).toBe(200);
    expect(
      all.body.data.some((r: { reason: string }) => r.reason === "spam"),
    ).toBe(true);
    expect(
      all.body.data.every((r: { status: string }) => r.status === "pending"),
    ).toBe(true);

    // New reports default to "pending" → filtering by resolved excludes them.
    const resolved = await request(app).get(
      "/api/admin/reports?status=resolved",
    );
    expect(resolved.status).toBe(200);
    expect(
      resolved.body.data.some((r: { reason: string }) => r.reason === "spam"),
    ).toBe(false);
  });
});
