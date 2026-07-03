import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for admin moderation actions
// (docs/API.md §14). Same pattern as the admin-communities suite: mock
// isAuthenticated to inject req.user and requireAdmin to gate on isAdmin (both
// from mockUser so non-admins can be simulated). Storage runs against the test
// DB; supabase + rate limiters are mocked (no network).
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
import { users, communities, posts, auditLog, reports } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `mod+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedCommunity(creatorId: string): Promise<string> {
  const c = await storage.createCommunity({
    name: `C${Math.random().toString(36).slice(2, 8)}`,
    creatorId,
  });
  createdCommunityIds.push(c.id);
  return c.id;
}

async function seedPost(
  communityId: string,
  authorId: string,
): Promise<string> {
  const result = await storage.createPost(communityId, authorId, "treść");
  if (result.status !== "created")
    throw new Error(`seedPost: ${result.status}`);
  return result.post.id;
}

// Insert a pending report (resourceId need not reference a real row — the column
// is a plain uuid, not an FK). Returns the report id.
async function seedReport(
  reporterId: string,
  resourceId: string,
  resourceType = "post",
): Promise<string> {
  await storage.submitReport(reporterId, {
    resourceType,
    resourceId,
    reason: "spam",
  });
  const [row] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, reporterId),
        eq(reports.resourceId, resourceId),
      ),
    )
    .limit(1);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
    await db
      .delete(reports)
      .where(inArray(reports.reviewedById, createdUserIds));
  }
  if (createdCommunityIds.length) {
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds)); // cascades posts + memberships
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

describe("admin moderation gating", () => {
  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app)
      .patch(`/api/admin/reports/${randomUUID()}`)
      .send({ status: "resolved" });
    expect(res.status).toBe(401);
  });

  it("authenticated non-admin → 403", async () => {
    const id = await seedUser();
    mockUser = { id, isAdmin: false };
    const res = await request(app)
      .post("/api/admin/moderation/remove-content")
      .send({ resourceType: "post", resourceId: randomUUID() });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/reports/:id", () => {
  it("resolves a pending report → 200 AdminReportDTO + audit", async () => {
    const admin = await seedUser();
    const reporter = await seedUser();
    const reportId = await seedReport(reporter, randomUUID());
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: "resolved", resolution: "  removed the post  " });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("resolved");
    expect(res.body.reviewedById).toBe(admin);
    expect(res.body.reviewedAt).not.toBeNull();
    expect(res.body.resolution).toBe("removed the post"); // trimmed

    const [row] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(row.status).toBe("resolved");
    expect(row.reviewedById).toBe(admin);

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    const entry = audits.find((a) => a.action === "report.resolved");
    expect(entry).toBeTruthy();
    // Audit privacy: references the report id only, no reason/resolution text.
    expect(entry!.resourceType).toBe("report");
    expect(entry!.resourceId).toBe(reportId);
    expect(entry!.metadata).toBeNull();
  });

  it("dismisses a pending report → 200, audit report.dismissed", async () => {
    const admin = await seedUser();
    const reporter = await seedUser();
    const reportId = await seedReport(reporter, randomUUID());
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: "dismissed" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dismissed");
    expect(res.body.resolution).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    expect(audits.some((a) => a.action === "report.dismissed")).toBe(true);
  });

  it("re-actioning an already-resolved report → 409", async () => {
    const admin = await seedUser();
    const reporter = await seedUser();
    const reportId = await seedReport(reporter, randomUUID());
    mockUser = { id: admin, isAdmin: true };

    const first = await request(app)
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: "resolved" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: "dismissed" });
    expect(second.status).toBe(409);
  });

  it("missing report → 404", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/reports/${randomUUID()}`)
      .send({ status: "resolved" });
    expect(res.status).toBe(404);
  });

  it("invalid id → 400; bad status → 400; extra field → 400", async () => {
    const admin = await seedUser();
    const reporter = await seedUser();
    const reportId = await seedReport(reporter, randomUUID());
    mockUser = { id: admin, isAdmin: true };

    expect(
      (
        await request(app)
          .patch("/api/admin/reports/not-a-uuid")
          .send({ status: "resolved" })
      ).status,
    ).toBe(400);

    // "pending" is not an accepted transition target.
    expect(
      (
        await request(app)
          .patch(`/api/admin/reports/${reportId}`)
          .send({ status: "pending" })
      ).status,
    ).toBe(400);

    expect(
      (
        await request(app)
          .patch(`/api/admin/reports/${reportId}`)
          .send({ status: "resolved", note: "x" })
      ).status,
    ).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .patch(`/api/admin/reports/${randomUUID()}`)
      .send({ status: "resolved" });
    expect(res.status).toBe(429);
  });
});

describe("GET /api/admin/reports (AdminReportDTO)", () => {
  it("lists a resolved report with reviewer/time/resolution fields", async () => {
    const admin = await seedUser();
    const reporter = await seedUser();
    const reportId = await seedReport(reporter, randomUUID());
    mockUser = { id: admin, isAdmin: true };

    // Resolve it, then confirm it surfaces in the admin list with internals.
    await request(app)
      .patch(`/api/admin/reports/${reportId}`)
      .send({ status: "resolved", resolution: "handled" });

    const res = await request(app).get("/api/admin/reports?status=resolved");
    expect(res.status).toBe(200);
    const entry = res.body.data.find((r: { id: string }) => r.id === reportId);
    expect(entry).toBeTruthy();
    expect(entry.status).toBe("resolved");
    expect(entry.reviewedById).toBe(admin);
    expect(entry.reviewedAt).not.toBeNull();
    expect(entry.resolution).toBe("handled");
  });

  it("an invalid ?status → 400, not 500 (IV-1)", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    // status fails the enum → the query safeParse returns 400 (was a 500).
    const res = await request(app).get("/api/admin/reports?status=bogus");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
  });
});

describe("POST /api/admin/moderation/remove-content", () => {
  it("removes a post → 200, scrubs stored content + audit", async () => {
    const admin = await seedUser();
    const author = await seedUser();
    const cid = await seedCommunity(author);
    const postId = await seedPost(cid, author);
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/moderation/remove-content")
      .send({ resourceType: "post", resourceId: postId });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row.deletedAt).not.toBeNull();
    expect(row.content).toBe("[deleted]");
    expect(row.imageUrl).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    const entry = audits.find((a) => a.action === "moderation.content_removed");
    expect(entry).toBeTruthy();
    expect(entry!.resourceType).toBe("post");
    expect(entry!.resourceId).toBe(postId);
    expect(entry!.metadata).toBeNull();
  });

  it("missing post → 404; already-removed post → 404", async () => {
    const admin = await seedUser();
    const author = await seedUser();
    const cid = await seedCommunity(author);
    const postId = await seedPost(cid, author);
    mockUser = { id: admin, isAdmin: true };

    expect(
      (
        await request(app)
          .post("/api/admin/moderation/remove-content")
          .send({ resourceType: "post", resourceId: randomUUID() })
      ).status,
    ).toBe(404);

    const first = await request(app)
      .post("/api/admin/moderation/remove-content")
      .send({ resourceType: "post", resourceId: postId });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/admin/moderation/remove-content")
      .send({ resourceType: "post", resourceId: postId });
    expect(second.status).toBe(404); // already deleted
  });

  it("unsupported resourceType → 400; bad body → 400", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    expect(
      (
        await request(app)
          .post("/api/admin/moderation/remove-content")
          .send({ resourceType: "message", resourceId: randomUUID() })
      ).status,
    ).toBe(400);

    expect(
      (
        await request(app)
          .post("/api/admin/moderation/remove-content")
          .send({ resourceType: "post", resourceId: "not-a-uuid" })
      ).status,
    ).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/admin/moderation/remove-content")
      .send({ resourceType: "post", resourceId: randomUUID() });
    expect(res.status).toBe(429);
  });
});
