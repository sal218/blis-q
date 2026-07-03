import { randomUUID } from "crypto";

// INJ-02 — search terms must be LIKE-escaped before ilike interpolation so a
// user's `%`/`_` match literally instead of acting as wildcards. Unit-tests the
// likeEscape helper (covers all three call sites, which share it) + a
// representative DB test through storage.listCommunities.

jest.mock("../auth", () => ({
  invalidateProfileCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

import { likeEscape } from "../likeEscape";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, communities, auditLog } from "@shared/schema";
import { inArray } from "drizzle-orm";

jest.setTimeout(30000);

describe("likeEscape (unit)", () => {
  it("escapes % _ and backslash; leaves other chars untouched", () => {
    expect(likeEscape("a%b")).toBe("a\\%b");
    expect(likeEscape("a_b")).toBe("a\\_b");
    expect(likeEscape("a\\b")).toBe("a\\\\b");
    expect(likeEscape("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
    expect(likeEscape("plain text 123")).toBe("plain text 123");
    expect(likeEscape("")).toBe("");
  });
});

describe("community search escaping (INJ-02, real DB)", () => {
  const createdUserIds: string[] = [];
  const createdCommunityIds: string[] = [];

  async function seedUser(): Promise<string> {
    const id = randomUUID();
    createdUserIds.push(id);
    await storage.registerUser({
      id,
      email: `inj+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      displayName: "Tester",
      consentTypes: ["account_creation"],
      policyVersion: "2026-06-10",
    });
    return id;
  }

  async function seedCommunity(creatorId: string, name: string): Promise<void> {
    const c = await storage.createCommunity({ name, creatorId });
    createdCommunityIds.push(c.id);
  }

  afterEach(async () => {
    if (createdCommunityIds.length) {
      await db
        .delete(communities)
        .where(inArray(communities.id, createdCommunityIds));
    }
    if (createdUserIds.length) {
      await db
        .delete(auditLog)
        .where(inArray(auditLog.actorId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    createdUserIds.length = 0;
    createdCommunityIds.length = 0;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("a '%' in the term matches literally, not as a wildcard", async () => {
    const owner = await seedUser();
    const tag = randomUUID().slice(0, 8); // isolate this run's rows
    await seedCommunity(owner, `${tag}-a%b`);
    await seedCommunity(owner, `${tag}-axb`);

    const { rows } = await storage.listCommunities({
      offset: 0,
      limit: 50,
      search: `${tag}-a%b`,
      callerId: owner,
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain(`${tag}-a%b`);
    expect(names).not.toContain(`${tag}-axb`); // would match if '%' were a wildcard
  });

  it("an '_' in the term matches literally, not as a single-char wildcard", async () => {
    const owner = await seedUser();
    const tag = randomUUID().slice(0, 8);
    await seedCommunity(owner, `${tag}-a_b`);
    await seedCommunity(owner, `${tag}-axb`);

    const { rows } = await storage.listCommunities({
      offset: 0,
      limit: 50,
      search: `${tag}-a_b`,
      callerId: owner,
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain(`${tag}-a_b`);
    expect(names).not.toContain(`${tag}-axb`);
  });
});
