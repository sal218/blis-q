import { randomUUID } from "crypto";

// Regression test for AUTH-1 (Realtime chat ban/erasure bypass). The live-chat
// authorization decision is NOT the Express layer — it is the Postgres predicate
// public.chat_topic_is_member(topic) (supabase/realtime-auth.sql), which the
// Supabase Realtime `chat broadcast read for members` policy calls. This suite
// exercises that predicate DIRECTLY against the real TEST DB, simulating the
// Realtime auth context the way Supabase does: as the `authenticated` role with
// the JWT subject in request.jwt.* GUCs, so auth.uid() resolves to our user.
//
// It proves the fix: a banned or erased member is DENIED, an active member is
// ALLOWED — i.e. membership alone no longer authorizes a suspended identity.
//
// REQUIRES the updated supabase/realtime-auth.sql to be applied to the TEST DB
// (human-run / out-of-band, like the RLS + schema DDL — see docs/DEPLOY.md). The
// function is created RLS-exception SECURITY DEFINER; EXECUTE is granted only to
// `authenticated`, hence the SET LOCAL ROLE below.
//
// Raw pool access here is the accepted test-harness exception (ENGINEERING §7 /
// CLAUDE.md AR-2): the predicate is a DB object, not reachable via storage.

jest.mock("../auth", () => ({
  invalidateProfileCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

import { storage } from "../storage";
import { db, pool } from "../db";
import { users, communities, auditLog, reports } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

jest.setTimeout(30000);

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCommunityIds: string[] = [];

function uniqueEmail(): string {
  return `rtauth+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

// Call public.chat_topic_is_member(topic) the way Supabase Realtime does: as the
// `authenticated` role, with the caller's id in BOTH request.jwt.claim.sub and
// request.jwt.claims (auth.uid() reads one or the other depending on the GoTrue
// version — set both so the check is robust). Transaction-local; rolled back.
async function topicAllows(
  userId: string,
  communityId: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const res = await client.query(
      "SELECT public.chat_topic_is_member($1) AS ok",
      [`chat:${communityId}`],
    );
    return res.rows[0].ok === true;
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
  }
  if (createdCommunityIds.length) {
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

describe("chat_topic_is_member — Realtime chat authorization (AUTH-1)", () => {
  it("ALLOWS an active member", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);

    expect(await topicAllows(member, cid)).toBe(true);
    // the creator (admin member) too
    expect(await topicAllows(owner, cid)).toBe(true);
  });

  it("DENIES a banned member (the fix — membership alone is not enough)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);
    expect(await topicAllows(member, cid)).toBe(true); // before ban

    await db
      .update(users)
      .set({ bannedAt: new Date() })
      .where(eq(users.id, member));

    expect(await topicAllows(member, cid)).toBe(false); // after ban
  });

  it("DENIES an erased member (deleted_at set, membership still present)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);

    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, member));

    expect(await topicAllows(member, cid)).toBe(false);
  });

  it("DENIES a non-member", async () => {
    const owner = await seedUser();
    const outsider = await seedUser();
    const cid = await seedCommunity(owner);

    expect(await topicAllows(outsider, cid)).toBe(false);
  });

  it("DENIES a member of a soft-deleted community (existing rule, regression-guard)", async () => {
    const owner = await seedUser();
    const member = await seedUser();
    const cid = await seedCommunity(owner);
    await storage.joinCommunity(cid, member);

    await db
      .update(communities)
      .set({ deletedAt: new Date() })
      .where(eq(communities.id, cid));

    expect(await topicAllows(member, cid)).toBe(false);
  });
});
