import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Authenticated-route test: mock only isAuthenticated (inject req.user) and the
// profile-cache invalidator (so we can assert it's called); everything else is
// real against the test DB. Content is seeded directly (AR-2) across EVERY
// user-referencing table to prove the erasure cascade.
// Mock ../auth WITHOUT requireActual — spreading the real module triggers a
// circular load (auth → storage → auth) that binds storage to the real
// invalidateProfileCache, defeating the spy. We stub only what the loaded route
// graph imports from ../auth.
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
  supabaseAdmin: {
    auth: { admin: { signOut: jest.fn(), deleteUser: jest.fn() } },
  },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkAccountUpdateRateLimit: jest.fn(),
  checkChangePasswordRateLimit: jest.fn(),
  checkExportRateLimit: jest.fn(),
  checkEraseAccountRateLimit: jest.fn(),
}));

import { registerAccountRoutes } from "../routes/account";
import { invalidateProfileCache } from "../auth";
import { supabaseAdmin } from "../supabase";
import { checkEraseAccountRateLimit } from "../rateLimit";
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
  safePlaces,
  adCampaigns,
  blocks,
  reports,
  consentRecords,
  devicePushTokens,
  notificationPreferences,
  subscriptions,
  passwordResetTokens,
  auditLog,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerAccountRoutes(app);

jest.setTimeout(30000); // heavy multi-table seeding against the real DB

const invalidateMock = invalidateProfileCache as unknown as jest.Mock;
const signOutMock = supabaseAdmin.auth.admin.signOut as unknown as jest.Mock;
const deleteUserMock = supabaseAdmin.auth.admin.deleteUser as unknown as jest.Mock;
const eraseRl = checkEraseAccountRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];
const createdSafePlaceIds: string[] = [];
const createdAdCampaignIds: string[] = [];
const createdReportIds: string[] = [];

function uniqueEmail(): string {
  return `era+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

// Seed a row in every user-referencing table. Returns ids for later assertions.
async function seedEverything(userId: string, otherUserId: string) {
  const [community] = await db
    .insert(communities)
    .values({ name: "Społeczność", createdById: userId })
    .returning({ id: communities.id });
  createdCommunityIds.push(community.id);

  await db
    .insert(communityMemberships)
    .values({ communityId: community.id, userId, role: "member" });
  const [post] = await db
    .insert(posts)
    .values({ communityId: community.id, authorId: userId, content: "Cześć" })
    .returning({ id: posts.id });
  const [message] = await db
    .insert(messages)
    .values({ communityId: community.id, senderId: userId, content: "Hej" })
    .returning({ id: messages.id });
  const [event] = await db
    .insert(events)
    .values({
      communityId: community.id,
      title: "Wydarzenie",
      startsAt: new Date(),
      createdById: userId,
    })
    .returning({ id: events.id });
  await db
    .insert(eventRsvps)
    .values({ eventId: event.id, userId, status: "going" });

  const [safePlace] = await db
    .insert(safePlaces)
    .values({ name: "Miejsce", category: "cafe", createdById: userId })
    .returning({ id: safePlaces.id });
  createdSafePlaceIds.push(safePlace.id);
  const [adCampaign] = await db
    .insert(adCampaigns)
    .values({ name: "Kampania", createdById: userId })
    .returning({ id: adCampaigns.id });
  createdAdCampaignIds.push(adCampaign.id);

  const [report1] = await db
    .insert(reports)
    .values({
      reporterId: userId,
      resourceType: "post",
      resourceId: randomUUID(),
      reason: "spam",
    })
    .returning({ id: reports.id });
  const [report2] = await db
    .insert(reports)
    .values({
      reporterId: otherUserId,
      reviewedById: userId,
      resourceType: "message",
      resourceId: randomUUID(),
      reason: "abuse",
      status: "resolved",
    })
    .returning({ id: reports.id });
  createdReportIds.push(report1.id, report2.id);

  await db
    .insert(blocks)
    .values({ blockerId: userId, blockedId: otherUserId });
  await db
    .insert(blocks)
    .values({ blockerId: otherUserId, blockedId: userId });
  await db
    .insert(devicePushTokens)
    .values({ userId, token: `tok-${userId}`, platform: "ios" });
  await db.insert(subscriptions).values({ userId, status: "active" });
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: `hash-${userId}`,
    expiresAt: new Date(Date.now() + 3600_000),
  });

  return { post, message, event, safePlace, adCampaign, report1, report2 };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  eraseRl.mockResolvedValue({ allowed: true });
  signOutMock.mockResolvedValue({ data: {}, error: null });
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  invalidateMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (createdReportIds.length) {
    await db.delete(reports).where(inArray(reports.id, createdReportIds));
  }
  if (createdSafePlaceIds.length) {
    await db.delete(safePlaces).where(inArray(safePlaces.id, createdSafePlaceIds));
  }
  if (createdAdCampaignIds.length) {
    await db
      .delete(adCampaigns)
      .where(inArray(adCampaigns.id, createdAdCampaignIds));
  }
  if (createdUserIds.length) {
    await db.delete(blocks).where(inArray(blocks.blockerId, createdUserIds));
    await db.delete(blocks).where(inArray(blocks.blockedId, createdUserIds));
  }
  if (createdCommunityIds.length) {
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds));
  }
  // Erasure nulls actorId, so delete the audit rows we produce by action.
  await db
    .delete(auditLog)
    .where(inArray(auditLog.action, ["user.registered", "user.deleted"]));
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
  createdCommunityIds.length = 0;
  createdSafePlaceIds.length = 0;
  createdAdCampaignIds.length = 0;
  createdReportIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("DELETE /api/v1/account", () => {
  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app).delete("/api/v1/account");
    expect(res.status).toBe(401);
  });

  it("rate-limited → 429", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    eraseRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).delete("/api/v1/account");
    expect(res.status).toBe(429);
  });

  it("erases the user across every table, anonymises in place, cleans up cross-system", async () => {
    const { id } = await seedUser();
    const other = await seedUser();
    const seeded = await seedEverything(id, other.id);

    mockUser = { id };
    const res = await request(app)
      .delete("/api/v1/account")
      .set("Authorization", "Bearer access-tok");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // users row anonymised IN PLACE (not deleted).
    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user).toBeTruthy();
    expect(user.email).toBe(`deleted-${id}@deleted.invalid`);
    expect(user.displayName).toBe("[deleted]");
    expect(user.avatarUrl).toBeNull();
    expect(user.preferredCity).toBeNull();
    expect(user.isPremium).toBe(false);
    expect(user.isAdmin).toBe(false);
    expect(user.deletedAt).not.toBeNull();

    // Content scrubbed + author/sender severed.
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, seeded.post.id));
    expect(post.content).toBe("[deleted]");
    expect(post.authorId).toBeNull();
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, seeded.message.id));
    expect(message.content).toBe("[deleted]");
    expect(message.senderId).toBeNull();

    // Creator/reporter/reviewer FKs nulled; rows SURVIVE.
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.id, createdCommunityIds[0]));
    expect(community.createdById).toBeNull();
    const [event] = await db
      .select()
      .from(events)
      .where(eq(events.id, seeded.event.id));
    expect(event.createdById).toBeNull();
    const [safePlace] = await db
      .select()
      .from(safePlaces)
      .where(eq(safePlaces.id, seeded.safePlace.id));
    expect(safePlace.createdById).toBeNull();
    const [adCampaign] = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.id, seeded.adCampaign.id));
    expect(adCampaign.createdById).toBeNull();
    const [report1] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, seeded.report1.id));
    expect(report1.reporterId).toBeNull();
    const [report2] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, seeded.report2.id));
    expect(report2.reviewedById).toBeNull();

    // Relational/consent/token rows removed.
    expect(
      await db
        .select()
        .from(communityMemberships)
        .where(eq(communityMemberships.userId, id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(eventRsvps).where(eq(eventRsvps.userId, id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(blocks).where(eq(blocks.blockerId, id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(blocks).where(eq(blocks.blockedId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.userId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(devicePushTokens)
        .where(eq(devicePushTokens.userId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.userId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, id)),
    ).toHaveLength(0);

    // Audit: no row still references the erased user; a user.deleted exists
    // carrying no user identifier.
    const actorRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    expect(actorRows).toHaveLength(0);
    const deletedRows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "user.deleted"));
    expect(deletedRows.length).toBeGreaterThanOrEqual(1);
    expect(deletedRows.every((r) => r.actorId === null)).toBe(true);
    expect(deletedRows.every((r) => r.resourceId === null)).toBe(true);
    expect(
      deletedRows.every(
        (r) => !JSON.stringify(r.metadata ?? null).includes(id),
      ),
    ).toBe(true);

    // Cross-system: cache invalidated, Supabase session + auth user cleaned up.
    expect(invalidateMock).toHaveBeenCalledWith(id);
    expect(signOutMock).toHaveBeenCalledWith("access-tok", "global");
    expect(deleteUserMock).toHaveBeenCalledWith(id);
  });

  it("is idempotent — a second erase still returns 200 and stays anonymised", async () => {
    const { id } = await seedUser();
    mockUser = { id };

    const first = await request(app)
      .delete("/api/v1/account")
      .set("Authorization", "Bearer access-tok");
    expect(first.status).toBe(200);

    const second = await request(app)
      .delete("/api/v1/account")
      .set("Authorization", "Bearer access-tok");
    expect(second.status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user.displayName).toBe("[deleted]");
    expect(user.email).toBe(`deleted-${id}@deleted.invalid`);
  });

  it("returns generic 200 even if Supabase cleanup fails (PII already erased)", async () => {
    const { id } = await seedUser();
    mockUser = { id };
    signOutMock.mockRejectedValueOnce(new Error("supabase down"));
    deleteUserMock.mockRejectedValueOnce(new Error("supabase down"));

    const res = await request(app)
      .delete("/api/v1/account")
      .set("Authorization", "Bearer access-tok");

    expect(res.status).toBe(200);
    // DB erasure still committed.
    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user.displayName).toBe("[deleted]");
  });
});
