import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Authenticated-route test: mock only isAuthenticated to inject req.user. Content
// rows are seeded directly via db.insert (no create-routes exist yet — AR-2
// test-harness exception) to prove the export reads every section, including
// soft-deleted posts/messages and ONLY the caller's own data.
let mockUser: { id: string } | null = null;
jest.mock("../auth", () => {
  const actual = jest.requireActual("../auth");
  const inject = (
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
  };
  return {
    ...actual,
    isAuthenticated: inject,
    // GET /account/export uses the allow-banned variant; mock it the same way.
    isAuthenticatedAllowBanned: inject,
  };
});

jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkAccountUpdateRateLimit: jest.fn(),
  checkChangePasswordRateLimit: jest.fn(),
  checkExportRateLimit: jest.fn(),
}));

import { registerAccountRoutes } from "../routes/account";
import { checkExportRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import {
  users,
  communities,
  communityMemberships,
  posts,
  messages,
  events,
  eventRsvps,
  blocks,
  reports,
  subscriptions,
  auditLog,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAccountRoutes(app);

// These tests seed many rows against the real (Frankfurt) DB — each insert is a
// network round-trip, so the default 5s timeout is too tight for the full case.
jest.setTimeout(20000);

const exportRl = checkExportRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `exp+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedCommunity(ownerId: string): Promise<string> {
  const [c] = await db
    .insert(communities)
    .values({ name: "Społeczność", createdById: ownerId })
    .returning({ id: communities.id });
  createdCommunityIds.push(c.id);
  return c.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  exportRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db
      .delete(subscriptions)
      .where(inArray(subscriptions.userId, createdUserIds));
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
    await db.delete(blocks).where(inArray(blocks.blockerId, createdUserIds));
    await db.delete(blocks).where(inArray(blocks.blockedId, createdUserIds));
  }
  if (createdCommunityIds.length) {
    // Cascades posts / messages / events / memberships / rsvps.
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds));
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

describe("GET /api/v1/account/export", () => {
  it("exports every section, including soft-deleted posts/messages", async () => {
    const { id } = await seedUser();
    const blocked = await seedUser();
    const communityId = await seedCommunity(id);

    await db
      .insert(communityMemberships)
      .values({ communityId, userId: id, role: "member" });
    await db.insert(posts).values([
      { communityId, authorId: id, content: "Cześć" },
      {
        communityId,
        authorId: id,
        content: "[deleted]",
        deletedAt: new Date(),
      },
    ]);
    await db.insert(messages).values([
      { communityId, senderId: id, content: "Wiadomość" },
      {
        communityId,
        senderId: id,
        content: "[deleted]",
        deletedAt: new Date(),
      },
    ]);
    const [event] = await db
      .insert(events)
      .values({ communityId, title: "Wydarzenie", startsAt: new Date() })
      .returning({ id: events.id });
    await db
      .insert(eventRsvps)
      .values({ eventId: event.id, userId: id, status: "going" });
    await db.insert(blocks).values({ blockerId: id, blockedId: blocked.id });
    await db.insert(reports).values({
      reporterId: id,
      resourceType: "post",
      resourceId: randomUUID(),
      reason: "spam",
    });
    await db.insert(subscriptions).values({
      userId: id,
      status: "active",
      productId: "premium_monthly",
      store: "app_store",
    });

    mockUser = { id };
    const res = await request(app).get("/api/v1/account/export");

    expect(res.status).toBe(200);
    expect(res.body.profile.id).toBe(id);
    expect(typeof res.body.createdAt).toBe("string");

    expect(res.body.communities).toHaveLength(1);
    expect(res.body.communities[0].name).toBe("Społeczność");

    // Both posts present, incl. the soft-deleted one (flagged).
    expect(res.body.posts).toHaveLength(2);
    expect(
      res.body.posts.some(
        (p: { deleted: boolean; content: string }) =>
          p.deleted === true && p.content === "[deleted]",
      ),
    ).toBe(true);
    expect(res.body.messages).toHaveLength(2);
    expect(
      res.body.messages.some((m: { deleted: boolean }) => m.deleted === true),
    ).toBe(true);

    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].status).toBe("going");

    expect(res.body.consents).toHaveLength(1);
    expect(res.body.notificationPreferences.communityPosts).toBe(true);

    expect(res.body.blocks).toHaveLength(1);
    expect(res.body.blocks[0].blockedUserId).toBe(blocked.id);

    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0].resourceType).toBe("post");

    expect(res.body.subscription).not.toBeNull();
    expect(res.body.subscription.status).toBe("active");
    expect(res.body.subscription.productId).toBe("premium_monthly");
  });

  it("only includes the caller's own content (isolation)", async () => {
    const a = await seedUser();
    const b = await seedUser();
    const communityId = await seedCommunity(a.id);
    const [aPost] = await db
      .insert(posts)
      .values({ communityId, authorId: a.id, content: "A" })
      .returning({ id: posts.id });
    const [bPost] = await db
      .insert(posts)
      .values({ communityId, authorId: b.id, content: "B" })
      .returning({ id: posts.id });

    mockUser = { id: a.id };
    const res = await request(app).get("/api/v1/account/export");

    const postIds = res.body.posts.map((p: { id: string }) => p.id);
    expect(postIds).toContain(aPost.id);
    expect(postIds).not.toContain(bPost.id);
  });

  it("empty user → empty arrays, consents present, no subscription", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    const res = await request(app).get("/api/v1/account/export");

    expect(res.status).toBe(200);
    expect(res.body.communities).toEqual([]);
    expect(res.body.posts).toEqual([]);
    expect(res.body.messages).toEqual([]);
    expect(res.body.events).toEqual([]);
    expect(res.body.blocks).toEqual([]);
    expect(res.body.reports).toEqual([]);
    expect(res.body.subscription).toBeNull();
    expect(res.body.consents).toHaveLength(1);
    expect(res.body.notificationPreferences).toBeTruthy();
  });

  it("writes a user.data_exported audit row", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    await request(app).get("/api/v1/account/export");

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(audits.some((a) => a.action === "user.data_exported")).toBe(true);
  });

  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app).get("/api/v1/account/export");
    expect(res.status).toBe(401);
  });

  it("rate-limited → 429", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    exportRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });

    const res = await request(app).get("/api/v1/account/export");
    expect(res.status).toBe(429);
  });
});
