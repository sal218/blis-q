import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for the admin user directory + ban/unban
// (P-15, docs/API.md §14). Same pattern as the admin-moderation suite: mock
// isAuthenticated to inject req.user and requireAdmin to gate on isAdmin; storage
// runs against the test DB; supabase + rate limiters are mocked.
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
import { invalidateProfileCache } from "../auth";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;
const invalidateMock = invalidateProfileCache as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];

function uniqueEmail(prefix = "usr"): string {
  return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function seedUser(email?: string): Promise<string> {
  const id = randomUUID();
  createdUserIds.push(id);
  await storage.registerUser({
    id,
    email: email ?? uniqueEmail(),
    displayName: "Tester",
    consentTypes: ["account_creation"],
    policyVersion: POLICY_VERSION,
  });
  return id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("admin users — gating", () => {
  it("unauthenticated → 401", async () => {
    mockUser = null;
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
  });

  it("authenticated non-admin → 403", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: false };
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/ban")
          .send({ userId: randomUUID() })
      ).status,
    ).toBe(403);
  });
});

describe("GET /api/admin/users", () => {
  it("lists users (AdminUserDTO incl. email); search + status filters; pagination", async () => {
    const admin = await seedUser();
    const targetEmail = uniqueEmail("findme");
    const target = await seedUser(targetEmail);
    const banned = await seedUser();
    await storage.banUser(banned, admin);
    mockUser = { id: admin, isAdmin: true };

    const all = await request(app).get("/api/admin/users?pageSize=100");
    expect(all.status).toBe(200);
    expect(all.body.page).toBe(1);
    expect(typeof all.body.total).toBe("number");
    const targetRow = all.body.data.find(
      (u: { id: string }) => u.id === target,
    );
    expect(targetRow).toBeTruthy();
    expect(targetRow.email).toBe(targetEmail); // admin surface includes email
    expect(targetRow.bannedAt).toBeNull();

    const search = await request(app).get(
      `/api/admin/users?search=${encodeURIComponent("findme")}`,
    );
    expect(search.body.data.some((u: { id: string }) => u.id === target)).toBe(
      true,
    );
    expect(search.body.data.some((u: { id: string }) => u.id === admin)).toBe(
      false,
    );

    const onlyBanned = await request(app).get(
      "/api/admin/users?status=banned&pageSize=100",
    );
    const ids = onlyBanned.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(banned);
    expect(ids).not.toContain(admin);
  });
});

describe("GET /api/admin/users/:id", () => {
  it("200 with shape; 404 missing; 400 bad uuid", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const ok = await request(app).get(`/api/admin/users/${admin}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(admin);
    expect(ok.body).toHaveProperty("bannedAt");
    expect(ok.body).toHaveProperty("deletedAt");

    expect(
      (await request(app).get(`/api/admin/users/${randomUUID()}`)).status,
    ).toBe(404);
    expect((await request(app).get("/api/admin/users/not-a-uuid")).status).toBe(
      400,
    );
  });
});

describe("POST /api/admin/moderation/ban", () => {
  it("bans an active user → 200, sets bannedAt, audits, invalidates cache", async () => {
    const admin = await seedUser();
    const target = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    invalidateMock.mockClear(); // ignore the calls made during seeding

    const res = await request(app)
      .post("/api/admin/moderation/ban")
      .send({ userId: target });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const [row] = await db.select().from(users).where(eq(users.id, target));
    expect(row.bannedAt).not.toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    const entry = audits.find((a) => a.action === "moderation.user_banned");
    expect(entry).toBeTruthy();
    expect(entry!.resourceType).toBe("user");
    expect(entry!.resourceId).toBe(target);
    expect(entry!.metadata).toBeNull();

    expect(invalidateMock).toHaveBeenCalledWith(target);
  });

  it("already-banned → 409", async () => {
    const admin = await seedUser();
    const target = await seedUser();
    await storage.banUser(target, admin);
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/moderation/ban")
      .send({ userId: target });
    expect(res.status).toBe(409);
  });

  it("missing user → 404; erased user → 404", async () => {
    const admin = await seedUser();
    const erased = await seedUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, erased));
    mockUser = { id: admin, isAdmin: true };

    expect(
      (
        await request(app)
          .post("/api/admin/moderation/ban")
          .send({ userId: randomUUID() })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/ban")
          .send({ userId: erased })
      ).status,
    ).toBe(404);
  });

  it("bad body / extra field → 400; rate-limited → 429", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    expect(
      (await request(app).post("/api/admin/moderation/ban").send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/ban")
          .send({ userId: randomUUID(), note: "x" })
      ).status,
    ).toBe(400);

    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/ban")
          .send({ userId: randomUUID() })
      ).status,
    ).toBe(429);
  });
});

describe("POST /api/admin/moderation/unban", () => {
  it("unbans a banned user → 200, clears bannedAt, audits", async () => {
    const admin = await seedUser();
    const target = await seedUser();
    await storage.banUser(target, admin);
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/moderation/unban")
      .send({ userId: target });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, target));
    expect(row.bannedAt).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    expect(audits.some((a) => a.action === "moderation.user_unbanned")).toBe(
      true,
    );
  });

  it("not-banned → 409; missing → 404; rate-limited → 429", async () => {
    const admin = await seedUser();
    const active = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    expect(
      (
        await request(app)
          .post("/api/admin/moderation/unban")
          .send({ userId: active })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/unban")
          .send({ userId: randomUUID() })
      ).status,
    ).toBe(404);

    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect(
      (
        await request(app)
          .post("/api/admin/moderation/unban")
          .send({ userId: randomUUID() })
      ).status,
    ).toBe(429);
  });
});
