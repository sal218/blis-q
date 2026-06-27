import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for events & RSVPs (docs/API.md §10),
// same harness as the posts suite: mock isAuthenticated to inject req.user;
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

import { registerEventRoutes } from "../routes/events";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { notifyCommunityMembers } from "../notifications";
import { storage } from "../storage";
import { db, pool } from "../db";
import {
  users,
  communities,
  events,
  eventRsvps,
  auditLog,
  reports,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerEventRoutes(app);

jest.setTimeout(30000);

const contentRl = checkContentCreateRateLimit as unknown as jest.Mock;
const reportRl = checkReportRateLimit as unknown as jest.Mock;
const notifyMock = notifyCommunityMembers as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const HOUR = 3600_000;
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `event+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedEvent(
  communityId: string,
  creatorId: string,
  opts?: { startsAt?: Date; endsAt?: Date },
): Promise<string> {
  const startsAt = opts?.startsAt ?? new Date(Date.now() + HOUR);
  const result = await storage.createEvent(communityId, creatorId, {
    title: "Wydarzenie",
    startsAt: startsAt.toISOString(),
    endsAt: opts?.endsAt?.toISOString(),
  });
  if (result.status !== "created")
    throw new Error(`seedEvent: ${result.status}`);
  return result.event.id;
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
    // cascades events (→ event_rsvps), posts, memberships
    await db
      .delete(communities)
      .where(inArray(communities.id, createdCommunityIds));
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

describe("POST /api/v1/communities/:id/events", () => {
  it("member creates an event → 201, trimmed, audited", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner); // creator is an admin member
    mockUser = { id: owner };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "  Spotkanie  ",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Spotkanie"); // trimmed
    expect(res.body.goingCount).toBe(0);
    expect(res.body.rsvp).toBeNull();
    expect(res.body.deleted).toBe(false);

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [owner]));
    expect(audits.some((a) => a.action === "event.created")).toBe(true);
  });

  it("non-member → 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: outsider };

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "Nope",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(403);
  });

  it("whitespace-only title → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "   ",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it("endsAt <= startsAt → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const startsAt = new Date(Date.now() + 2 * HOUR);
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "Zła data",
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() - HOUR).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it("non-ISO startsAt → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({ title: "x", startsAt: "not-a-date" });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    contentRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "x",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(429);
  });

  it("missing community → 404", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    const res = await request(app)
      .post(`/api/v1/communities/${randomUUID()}/events`)
      .send({
        title: "x",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(404);
  });

  it("notification failure does NOT fail creation (best-effort)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    mockUser = { id: owner };
    notifyMock.mockRejectedValueOnce(new Error("push down"));

    const res = await request(app)
      .post(`/api/v1/communities/${cid}/events`)
      .send({
        title: "still works",
        startsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(201);
  });
});

describe("GET /api/v1/events (global upcoming feed)", () => {
  it("invalid cursor → 400", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    const bad = await request(app).get(
      `/api/v1/events?cursor=not-a-real-cursor`,
    );
    expect(bad.status).toBe(400);
  });

  it("excludes past events; orders soonest-first", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const soon = await seedEvent(cid, owner, {
      startsAt: new Date(Date.now() + HOUR),
    });
    const later = await seedEvent(cid, owner, {
      startsAt: new Date(Date.now() + 5 * HOUR),
    });
    const past = await seedEvent(cid, owner, {
      startsAt: new Date(Date.now() - HOUR),
    });
    mockUser = { id: owner };

    const res = await request(app).get(`/api/v1/events`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(soon);
    expect(ids).toContain(later);
    expect(ids).not.toContain(past);
    // ascending by startsAt: soon before later
    expect(ids.indexOf(soon)).toBeLessThan(ids.indexOf(later));
  });

  it("paginates by cursor across rows with the SAME startsAt (id tie-break)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const startsAt = new Date(Date.now() + 3 * HOUR);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(await seedEvent(cid, owner, { startsAt }));
    mockUser = { id: owner };

    const p1 = await request(app).get(`/api/v1/events?limit=2`);
    expect(p1.status).toBe(200);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();

    const p2 = await request(app).get(
      `/api/v1/events?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`,
    );
    expect(p2.status).toBe(200);

    const seen = [...p1.body.data, ...p2.body.data].map(
      (e: { id: string }) => e.id,
    );
    // every seeded event surfaces exactly once despite identical startsAt
    for (const id of ids) expect(seen.filter((s) => s === id)).toHaveLength(1);
  });

  it("hides events whose creator the caller has blocked", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const blockedEvent = await seedEvent(cid, blocked);
    const ownEvent = await seedEvent(cid, caller);
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const res = await request(app).get(`/api/v1/events`);
    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(ownEvent);
    expect(ids).not.toContain(blockedEvent);
  });

  it("goingCount reflects only status 'going'", async () => {
    const owner = await seedUser();
    const a = await seedUser();
    const b = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, a);
    await storage.joinCommunity(cid, b);
    const eid = await seedEvent(cid, owner);
    await storage.setRsvp(eid, a, "going");
    await storage.setRsvp(eid, b, "interested");
    mockUser = { id: owner };

    const res = await request(app).get(`/api/v1/events`);
    const ev = res.body.data.find((e: { id: string }) => e.id === eid);
    expect(ev.goingCount).toBe(1);
  });
});

describe("GET /api/v1/events/:id", () => {
  it("200 found (with caller rsvp); 404 missing/deleted/blocked", async () => {
    const caller = await seedUser();
    const blocked = await seedUser();
    const cid = await seedCommunity(caller);
    await storage.joinCommunity(cid, blocked);
    const eid = await seedEvent(cid, caller);
    const blockedEid = await seedEvent(cid, blocked);
    await storage.setRsvp(eid, caller, "going");
    await storage.blockUser(caller, blocked);
    mockUser = { id: caller };

    const ok = await request(app).get(`/api/v1/events/${eid}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(eid);
    expect(ok.body.rsvp).toEqual({ status: "going" });

    expect(
      (await request(app).get(`/api/v1/events/${randomUUID()}`)).status,
    ).toBe(404);

    // blocked creator's event is hidden → 404
    expect(
      (await request(app).get(`/api/v1/events/${blockedEid}`)).status,
    ).toBe(404);

    // deleted event → 404 (not a tombstone, unlike posts)
    await storage.softDeleteEvent(eid, caller);
    expect((await request(app).get(`/api/v1/events/${eid}`)).status).toBe(404);
  });

  it("404 when the community is deleted", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);
    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, cid));
    mockUser = { id: owner };

    expect((await request(app).get(`/api/v1/events/${eid}`)).status).toBe(404);
  });
});

describe("PATCH /api/v1/events/:id", () => {
  it("creator edits → 200; community mod edits → 200", async () => {
    const owner = await seedUser(); // admin
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const eid = await seedEvent(cid, member);

    mockUser = { id: member };
    const own = await request(app)
      .patch(`/api/v1/events/${eid}`)
      .send({ title: "Nowy tytuł" });
    expect(own.status).toBe(200);
    expect(own.body.title).toBe("Nowy tytuł");

    mockUser = { id: owner }; // admin of the community
    const mod = await request(app)
      .patch(`/api/v1/events/${eid}`)
      .send({ location: "Nowe miejsce" });
    expect(mod.status).toBe(200);
  });

  it("a non-creator non-mod member → 403", async () => {
    const owner = await seedUser();
    const author = await seedUser();
    const other = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, author);
    await storage.joinCommunity(cid, other);
    const eid = await seedEvent(cid, author);
    mockUser = { id: other };

    const res = await request(app)
      .patch(`/api/v1/events/${eid}`)
      .send({ title: "hijack" });
    expect(res.status).toBe(403);
  });

  it("empty body → 400 (no phantom update)", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);
    mockUser = { id: owner };
    const res = await request(app).patch(`/api/v1/events/${eid}`).send({});
    expect(res.status).toBe(400);
  });

  it("one-sided PATCH that inverts the range (merged candidate) → 400", async () => {
    const owner = await seedUser();
    const cid = await seedCommunity(owner);
    const startsAt = new Date(Date.now() + 4 * HOUR);
    const eid = await seedEvent(cid, owner, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
    });
    mockUser = { id: owner };

    // move startsAt AFTER the stored endsAt → invalid against the merged value
    const badStart = await request(app)
      .patch(`/api/v1/events/${eid}`)
      .send({
        startsAt: new Date(startsAt.getTime() + 3 * HOUR).toISOString(),
      });
    expect(badStart.status).toBe(400);

    // move endsAt BEFORE the stored startsAt → invalid against the merged value
    const badEnd = await request(app)
      .patch(`/api/v1/events/${eid}`)
      .send({ endsAt: new Date(startsAt.getTime() - HOUR).toISOString() });
    expect(badEnd.status).toBe(400);
  });

  it("missing event → 404", async () => {
    const owner = await seedUser();
    mockUser = { id: owner };
    expect(
      (
        await request(app)
          .patch(`/api/v1/events/${randomUUID()}`)
          .send({ title: "x" })
      ).status,
    ).toBe(404);
  });
});

describe("DELETE /api/v1/events/:id", () => {
  it("creator soft-deletes → 200 (scrub + audit); already-deleted → 404", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const eid = await seedEvent(cid, member);
    mockUser = { id: member };

    const res = await request(app).delete(`/api/v1/events/${eid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const [row] = await db.select().from(events).where(eq(events.id, eid));
    expect(row.deletedAt).not.toBeNull();
    expect(row.title).toBe("[deleted]");
    expect(row.description).toBeNull();
    expect(row.location).toBeNull();

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [member]));
    expect(audits.some((a) => a.action === "event.deleted")).toBe(true);

    // second delete finds no live row → 404
    expect((await request(app).delete(`/api/v1/events/${eid}`)).status).toBe(
      404,
    );
  });

  it("a community admin/mod can delete a member's event → 200", async () => {
    const owner = await seedUser(); // admin
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const eid = await seedEvent(cid, member);
    mockUser = { id: owner };

    expect((await request(app).delete(`/api/v1/events/${eid}`)).status).toBe(
      200,
    );
  });

  it("a non-creator non-mod member → 403", async () => {
    const owner = await seedUser();
    const author = await seedUser();
    const other = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, author);
    await storage.joinCommunity(cid, other);
    const eid = await seedEvent(cid, author);
    mockUser = { id: other };

    expect((await request(app).delete(`/api/v1/events/${eid}`)).status).toBe(
      403,
    );
  });
});

describe("POST /api/v1/events/:id/rsvp", () => {
  it("member upsert: going → interested updates the same row; goingCount follows", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    const eid = await seedEvent(cid, owner);
    mockUser = { id: member };

    const going = await request(app)
      .post(`/api/v1/events/${eid}/rsvp`)
      .send({ status: "going" });
    expect(going.status).toBe(200);
    expect(going.body).toEqual({ status: "going" });

    const interested = await request(app)
      .post(`/api/v1/events/${eid}/rsvp`)
      .send({ status: "interested" });
    expect(interested.status).toBe(200);

    // exactly one row for this (event, user) — the upsert updated in place
    const rows = await db
      .select()
      .from(eventRsvps)
      .where(eq(eventRsvps.eventId, eid));
    expect(rows.filter((r) => r.userId === member)).toHaveLength(1);
    expect(rows.find((r) => r.userId === member)?.status).toBe("interested");

    // goingCount now 0 (the member is no longer "going")
    mockUser = { id: owner };
    const detail = await request(app).get(`/api/v1/events/${eid}`);
    expect(detail.body.goingCount).toBe(0);
  });

  it("a non-member of the community → 403", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);
    mockUser = { id: outsider };

    const res = await request(app)
      .post(`/api/v1/events/${eid}/rsvp`)
      .send({ status: "going" });
    expect(res.status).toBe(403);
  });

  it("RSVP to a missing event → 404", async () => {
    const member = await seedUser();
    mockUser = { id: member };
    const res = await request(app)
      .post(`/api/v1/events/${randomUUID()}/rsvp`)
      .send({ status: "going" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/events/:id/report", () => {
  it("reports a visible event → 201", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/events/${eid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(201);

    const rows = await db
      .select()
      .from(reports)
      .where(inArray(reports.reporterId, [reporter]));
    expect(
      rows.some((r) => r.resourceId === eid && r.resourceType === "event"),
    ).toBe(true);
  });

  it("reporting a deleted event → 404", async () => {
    const owner = await seedUser();
    const reporter = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);
    await storage.softDeleteEvent(eid, owner);
    mockUser = { id: reporter };

    const res = await request(app)
      .post(`/api/v1/events/${eid}/report`)
      .send({ reason: "spam" });
    expect(res.status).toBe(404);
  });
});

describe("storage.adminRemoveEvent (moderation)", () => {
  it("guarded removal scrubs + audits; already-removed → not_found", async () => {
    const owner = await seedUser();
    const admin = await seedUser();
    const cid = await seedCommunity(owner);
    const eid = await seedEvent(cid, owner);

    const first = await storage.adminRemoveEvent(eid, admin);
    expect(first).toBe("removed");

    const [row] = await db.select().from(events).where(eq(events.id, eid));
    expect(row.deletedAt).not.toBeNull();
    expect(row.title).toBe("[deleted]");

    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    expect(
      audits.some(
        (a) =>
          a.action === "moderation.content_removed" &&
          a.resourceType === "event" &&
          a.resourceId === eid,
      ),
    ).toBe(true);

    // idempotent guard: a second removal finds no live row
    expect(await storage.adminRemoveEvent(eid, admin)).toBe("not_found");
  });
});

describe("erasure / cascade (schema ON DELETE)", () => {
  it("creator delete SET NULLs the event; RSVP cascades on user delete", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const rsvper = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    await storage.joinCommunity(cid, rsvper);
    const eid = await seedEvent(cid, member);
    await storage.setRsvp(eid, rsvper, "going");

    // delete the RSVP-er → their rsvp row cascades away
    await db.delete(auditLog).where(inArray(auditLog.actorId, [rsvper]));
    await db.delete(users).where(eq(users.id, rsvper));
    const rsvps = await db
      .select()
      .from(eventRsvps)
      .where(eq(eventRsvps.eventId, eid));
    expect(rsvps).toHaveLength(0);

    // delete the creator → event retained, createdById nulled (SET NULL)
    await db.delete(auditLog).where(inArray(auditLog.actorId, [member]));
    await db.delete(users).where(eq(users.id, member));
    const [ev] = await db.select().from(events).where(eq(events.id, eid));
    expect(ev).toBeTruthy();
    expect(ev.createdById).toBeNull();
  });
});
