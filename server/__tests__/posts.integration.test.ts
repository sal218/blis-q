import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for community posts (docs/API.md §8),
// same pattern as the communities suite: mock isAuthenticated to inject req.user;
// storage runs against the test DB; supabase + rate limiters + notifications are
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
}));

jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkContentCreateRateLimit: jest.fn(),
  checkReportRateLimit: jest.fn(),
}));

jest.mock("../notifications", () => ({
  notifyCommunityMembers: jest.fn().mockResolvedValue(undefined),
}));

import { registerPostRoutes } from "../routes/posts";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { notifyCommunityMembers } from "../notifications";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, communities, posts, auditLog, reports } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerPostRoutes(app);

jest.setTimeout(30000);

const contentRl = checkContentCreateRateLimit as unknown as jest.Mock;
const reportRl = checkReportRateLimit as unknown as jest.Mock;
const notifyMock = notifyCommunityMembers as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `post+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  contentRl.mockResolvedValue({ allowed: true });
  reportRl.mockResolvedValue({ allowed: true });
  notifyMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
  }
  if (createdCommunityIds.length) {
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds)); // cascades posts + memberships
  }
  if (createdUserIds.length) {
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds)); // cascades blocks
  }
  createdUserIds.length = 0;
  createdCommunityIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/communities/:id/posts", () => {
  it("member creates a post → 201, audited", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner); // creator is an admin member
    mockUser = { id: owner };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "  Pierwszy post  " });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Pierwszy post"); // trimmed
    expect(res.body.author.id).toBe(owner);
    expect(res.body.deleted).toBe(false);

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [owner]));
    expect(audits.some((a) => a.action === "post.created")).toBe(true);
  });

  it("non-member → 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: outsider };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "Nope" });
    expect(res.status).toBe(403);
  });

  it("whitespace-only content → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "   " });
    expect(res.status).toBe(400);
  });

  it("imageKey rejected (text-only this slice) → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "ok", imageKey: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    contentRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "x" });
    expect(res.status).toBe(429);
  });

  it("missing community → 404", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${randomUUID()}/posts`)
      .send({ content: "x" });
    expect(res.status).toBe(404);
  });

  it("notification failure does NOT fail creation (best-effort)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    notifyMock.mockRejectedValueOnce(new Error("push down"));

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/posts`)
      .send({ content: "still works" });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/communities/:id/posts", () => {
  it("missing community → 404; invalid cursor → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };

    expect(
      (await request(app).get(`/api/v1/communities/${randomUUID()}/posts`))
        .status,
    ).toBe(404);

    const bad = await request(app).get(
      `/api/v1/communities/${cid}/posts?cursor=not-a-real-cursor`,
    );
    expect(bad.status).toBe(400);
  });

  it("paginates by cursor, newest-first, covering all posts", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await seedPost(cid, owner));
    mockUser = { id: owner };

    const p1 = await request(app).get(
      `/api/v1/communities/${cid}/posts?limit=2`,
    );
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    // newest-first: createdAt non-increasing within the page.
    expect(p1.body.data[0].createdAt >= p1.body.data[1].createdAt).toBe(true);

    const p2 = await request(app).get(
      `/api/v1/communities/${cid}/posts?limit=2&cursor=${encodeURIComponent(
        p1.body.nextCursor,
      )}`,
    );
    expect(p2.status).toBe(200);
    expect(p2.body.nextCursor).toBeNull();

    const seen = [...p1.body.data, ...p2.body.data].map(
      (p: { id: string }) => p.id,
    );
    expect(new Set(seen).size).toBe(3);
    for (const id of ids) expect(seen).toContain(id);
  });

  it("hides posts authored by users the caller has blocked", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const blockedPostId = await seedPost(cid, blocked);
    const ownPostId = await seedPost(cid, caller);
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const res = await request(app).get(`/api/v1/communities/${cid}/posts`);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(ownPostId);
    expect(ids).not.toContain(blockedPostId);
  });

  it("returns deleted posts masked", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const pid = await seedPost(cid, owner);
    await storage.softDeletePost(pid, owner);
    mockUser = { id: owner };

    const res = await request(app).get(`/api/v1/communities/${cid}/posts`);
    const masked = res.body.data.find((p: { id: string }) => p.id === pid);
    expect(masked.deleted).toBe(true);
    expect(masked.content).toBe("[deleted]");
    expect(masked.author).toBeNull();
  });
});

describe("GET /api/v1/posts/:id", () => {
  it("200 found; 404 missing; deleted masked; blocked hidden → 404", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const pid = await seedPost(cid, caller);
    const blockedPid = await seedPost(cid, blocked);
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const ok = await request(app).get(`/api/v1/posts/${pid}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(pid);

    expect(
      (await request(app).get(`/api/v1/posts/${randomUUID()}`)).status,
    ).toBe(404);

    // blocked author's post is hidden → 404
    expect((await request(app).get(`/api/v1/posts/${blockedPid}`)).status).toBe(
      404,
    );

    await storage.softDeletePost(pid, caller);
    const masked = await request(app).get(`/api/v1/posts/${pid}`);
    expect(masked.status).toBe(200);
    expect(masked.body.content).toBe("[deleted]");
    expect(masked.body.author).toBeNull();
  });
});

describe("DELETE /api/v1/posts/:id", () => {
  it("author deletes own post → 200 (soft delete + audit)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, owner); // already admin; harmless
    const member = await seedUser();
    await storage.joinCommunity(cid, member);
    const pid = await seedPost(cid, member);
    mockUser = { id: member };

    const res = await request(app).delete(`/api/v1/posts/${pid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const [row] = await db.select().from(posts).where(eq(posts.id, pid));
    expect(row.deletedAt).not.toBeNull();
    // Stored content/media is scrubbed, not only masked in the DTO (API §8).
    expect(row.content).toBe("[deleted]");
    expect(row.imageUrl).toBeNull();
    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [member]));
    expect(audits.some((a) => a.action === "post.deleted")).toBe(true);
  });

  it("a community admin/mod can delete a member's post → 200", async () => {
    const owner = await seedUser(); // admin
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const pid = await seedPost(cid, member);
    mockUser = { id: owner };

    const res = await request(app).delete(`/api/v1/posts/${pid}`);
    expect(res.status).toBe(200);
  });

  it("a non-author non-mod member → 403", async () => {
    const owner = await seedUser();
    const author = await seedUser();
    const other = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, author);
    await storage.joinCommunity(cid, other);
    const pid = await seedPost(cid, author);
    mockUser = { id: other };

    const res = await request(app).delete(`/api/v1/posts/${pid}`);
    expect(res.status).toBe(403);
  });

  it("missing post → 404", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    expect(
      (await request(app).delete(`/api/v1/posts/${randomUUID()}`)).status,
    ).toBe(404);
  });

  it("rate-limited → 429", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const pid = await seedPost(cid, owner);
    contentRl.mockResolvedValueOnce({ allowed: false, retryAfter: 20 });
    mockUser = { id: owner };

    const res = await request(app).delete(`/api/v1/posts/${pid}`);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBe(20);
  });
});

describe("POST /api/v1/posts/:id/report", () => {
  it("reports a visible post → 201", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    const pid = await seedPost(cid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/posts/${pid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(reports)
      .where(inArray(reports.reporterId, [reporter]));
    expect(
      rows.some((r) => r.resourceId === pid && r.resourceType === "post"),
    ).toBe(true);
  });

  it("reporting a deleted post → 404", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    const pid = await seedPost(cid, owner);
    await storage.softDeletePost(pid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/posts/${pid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });

  it("reporting a missing post → 404", async () => {
    const reporter = await seedUser();
    mockUser = { id: reporter };
    const res = await request(app)
      .post(`/api/v1/posts/${randomUUID()}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });
});
