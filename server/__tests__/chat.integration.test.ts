import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for community chat (docs/API.md §9),
// same pattern as the posts suite: mock isAuthenticated to inject req.user;
// storage runs against the test DB; supabase + rate limiters + the Realtime
// broadcast helper are mocked so nothing hits the network.
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

jest.mock("../realtime", () => ({
  broadcastNewMessage: jest.fn().mockResolvedValue(undefined),
}));

import { registerChatRoutes } from "../routes/chat";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { broadcastNewMessage } from "../realtime";
import { storage } from "../storage";
import { db, pool } from "../db";
import {
  users,
  communities,
  messages,
  auditLog,
  reports,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerChatRoutes(app);

jest.setTimeout(30000);

const contentRl = checkContentCreateRateLimit as unknown as jest.Mock;
const reportRl = checkReportRateLimit as unknown as jest.Mock;
const broadcastMock = broadcastNewMessage as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `chat+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// Let the fire-and-forget broadcast microtask run after a response returns.
function flush(): Promise<void> {
  return new Promise((r) => setImmediate(r));
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

async function seedMessage(
  communityId: string,
  senderId: string,
): Promise<string> {
  const result = await storage.createMessage(communityId, senderId, "treść");
  if (result.status !== "created")
    throw new Error(`seedMessage: ${result.status}`);
  return result.message.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  contentRl.mockResolvedValue({ allowed: true });
  reportRl.mockResolvedValue({ allowed: true });
  broadcastMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
  }
  if (createdCommunityIds.length) {
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds)); // cascades messages + memberships
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

describe("POST /api/v1/communities/:id/messages", () => {
  it("member sends a message → 201 (trimmed) + broadcast attempted", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner); // creator is an admin member
    mockUser = { id: owner };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/messages`)
      .send({ content: "  Cześć  " });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Cześć"); // trimmed
    expect(res.body.sender.id).toBe(owner);
    expect(res.body.deleted).toBe(false);

    await flush();
    expect(broadcastMock).toHaveBeenCalledWith(
      cid,
      expect.objectContaining({ id: res.body.id, content: "Cześć" }),
    );
  });

  it("non-member → 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: outsider };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/messages`)
      .send({ content: "Nope" });
    expect(res.status).toBe(403);
  });

  it("whitespace-only content → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/messages`)
      .send({ content: "   " });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    contentRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/messages`)
      .send({ content: "x" });
    expect(res.status).toBe(429);
  });

  it("missing community → 404", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${randomUUID()}/messages`)
      .send({ content: "x" });
    expect(res.status).toBe(404);
  });

  it("broadcast failure does NOT fail the send (best-effort)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    broadcastMock.mockRejectedValueOnce(new Error("realtime down"));

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/messages`)
      .send({ content: "still works" });
    expect(res.status).toBe(201);
    await flush(); // the rejected broadcast is swallowed, not thrown
  });
});

describe("GET /api/v1/communities/:id/messages", () => {
  it("missing community → 404; non-member → 403; invalid cursor → 400", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);

    mockUser = { id: owner };
    expect(
      (await request(app).get(`/api/v1/communities/${randomUUID()}/messages`))
        .status,
    ).toBe(404);

    mockUser = { id: outsider };
    expect(
      (await request(app).get(`/api/v1/communities/${cid}/messages`)).status,
    ).toBe(403);

    mockUser = { id: owner };
    const bad = await request(app).get(
      `/api/v1/communities/${cid}/messages?cursor=not-a-real-cursor`,
    );
    expect(bad.status).toBe(400);
  });

  it("paginates by cursor, newest-first, covering all messages", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push(await seedMessage(cid, owner));
    mockUser = { id: owner };

    const p1 = await request(app).get(
      `/api/v1/communities/${cid}/messages?limit=2`,
    );
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    expect(p1.body.data[0].createdAt >= p1.body.data[1].createdAt).toBe(true);

    const p2 = await request(app).get(
      `/api/v1/communities/${cid}/messages?limit=2&cursor=${encodeURIComponent(
        p1.body.nextCursor,
      )}`,
    );
    expect(p2.status).toBe(200);
    expect(p2.body.nextCursor).toBeNull();

    const seen = [...p1.body.data, ...p2.body.data].map(
      (m: { id: string }) => m.id,
    );
    expect(new Set(seen).size).toBe(3);
    for (const id of ids) expect(seen).toContain(id);
  });

  it("hides messages from users the caller has blocked", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const blockedMsgId = await seedMessage(cid, blocked);
    const ownMsgId = await seedMessage(cid, caller);
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const res = await request(app).get(`/api/v1/communities/${cid}/messages`);
    const ids = res.body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain(ownMsgId);
    expect(ids).not.toContain(blockedMsgId);
  });

  it("returns deleted messages masked", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const mid = await seedMessage(cid, owner);
    await storage.softDeleteMessage(mid, owner);
    mockUser = { id: owner };

    const res = await request(app).get(`/api/v1/communities/${cid}/messages`);
    const masked = res.body.data.find((m: { id: string }) => m.id === mid);
    expect(masked.deleted).toBe(true);
    expect(masked.content).toBe("[deleted]");
    expect(masked.sender).toBeNull();
  });
});

describe("DELETE /api/v1/messages/:id", () => {
  it("sender deletes own message → 200 (scrub + audit)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const mid = await seedMessage(cid, member);
    mockUser = { id: member };

    const res = await request(app).delete(`/api/v1/messages/${mid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const [row] = await db.select().from(messages).where(eq(messages.id, mid));
    expect(row.deletedAt).not.toBeNull();
    expect(row.content).toBe("[deleted]");
    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [member]));
    expect(audits.some((a) => a.action === "message.deleted")).toBe(true);
  });

  it("a community admin/mod can delete a member's message → 200", async () => {
    const owner = await seedUser(); // admin
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const mid = await seedMessage(cid, member);
    mockUser = { id: owner };

    const res = await request(app).delete(`/api/v1/messages/${mid}`);
    expect(res.status).toBe(200);
  });

  it("a non-sender non-mod member → 403", async () => {
    const owner = await seedUser();
    const sender = await seedUser();
    const other = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, sender);
    await storage.joinCommunity(cid, other);
    const mid = await seedMessage(cid, sender);
    mockUser = { id: other };

    const res = await request(app).delete(`/api/v1/messages/${mid}`);
    expect(res.status).toBe(403);
  });

  it("missing/already-deleted message → 404", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const mid = await seedMessage(cid, owner);
    await storage.softDeleteMessage(mid, owner);
    mockUser = { id: owner };

    expect(
      (await request(app).delete(`/api/v1/messages/${randomUUID()}`)).status,
    ).toBe(404);
    expect((await request(app).delete(`/api/v1/messages/${mid}`)).status).toBe(
      404,
    ); // already deleted
  });
});

describe("POST /api/v1/messages/:id/report", () => {
  it("member reports a visible message → 201", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, reporter);
    const mid = await seedMessage(cid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/messages/${mid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(reports)
      .where(inArray(reports.reporterId, [reporter]));
    expect(
      rows.some((r) => r.resourceId === mid && r.resourceType === "message"),
    ).toBe(true);
  });

  it("a non-member reporting → 404 (not visible)", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);
    const mid = await seedMessage(cid, owner);
    mockUser = { id: outsider };

    const res = await request(app)
      .post(`/api/v1/messages/${mid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });

  it("reporting a deleted message → 404", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, reporter);
    const mid = await seedMessage(cid, owner);
    await storage.softDeleteMessage(mid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/messages/${mid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });

  it("reporting a missing message → 404", async () => {
    const reporter = await seedUser();
    mockUser = { id: reporter };
    const res = await request(app)
      .post(`/api/v1/messages/${randomUUID()}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/chats (Messages inbox)", () => {
  it("returns joined communities + last-message preview; messageless → null; not-joined excluded", async () => {
    const owner = await seedUser();
    const withMsg = await seedCommunity(owner); // owner = admin member
    const empty = await seedCommunity(owner); // joined, no messages
    const other = await seedUser();
    const notMine = await seedCommunity(other); // owner NOT a member
    const mid = await seedMessage(withMsg, owner);
    mockUser = { id: owner };

    const res = await request(app).get("/api/v1/chats");
    expect(res.status).toBe(200);
    const byId: Record<string, { role: string; lastMessage: unknown }> =
      Object.fromEntries(
        res.body.map((c: { community: { id: string } }) => [c.community.id, c]),
      );
    expect(Object.keys(byId).sort()).toEqual([withMsg, empty].sort()); // joined only
    expect(byId[notMine]).toBeUndefined();
    expect(byId[withMsg].role).toBe("admin");
    expect((byId[withMsg].lastMessage as { id: string }).id).toBe(mid);
    expect(byId[empty].lastMessage).toBeNull();
  });

  it("empty array when the caller belongs to no communities", async () => {
    const u = await seedUser();
    mockUser = { id: u };
    const res = await request(app).get("/api/v1/chats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("block-filters the preview, then masks a deleted last message", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const mine = await seedMessage(cid, caller); // older, by caller
    await seedMessage(cid, blocked); // newest, by blocked → excluded from preview
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const res = await request(app).get("/api/v1/chats");
    const item = res.body.find(
      (x: { community: { id: string } }) => x.community.id === cid,
    );
    expect(item.lastMessage.id).toBe(mine); // fell back to the non-blocked one

    await storage.softDeleteMessage(mine, caller);
    const res2 = await request(app).get("/api/v1/chats");
    const item2 = res2.body.find(
      (x: { community: { id: string } }) => x.community.id === cid,
    );
    expect(item2.lastMessage.deleted).toBe(true);
    expect(item2.lastMessage.content).toBe("[deleted]");
    expect(item2.lastMessage.sender).toBeNull();
  });
});

describe("GDPR coverage for chat messages", () => {
  it("erasure scrubs the user's messages; export includes them", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const mid = await seedMessage(cid, owner);

    // Export (Art. 20): the sender's own message is present before erasure.
    const exported = await storage.getAccountExport(owner);
    expect(exported.messages.some((m) => m.id === mid)).toBe(true);

    // Erasure (Art. 17): content scrubbed + sender severed + marked deleted.
    await storage.eraseUser(owner);
    const [row] = await db.select().from(messages).where(eq(messages.id, mid));
    expect(row.content).toBe("[deleted]");
    expect(row.senderId).toBeNull();
    expect(row.deletedAt).not.toBeNull();
  });
});
