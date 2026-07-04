import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for safe places (docs/API.md §11/§14).
// isAuthenticated injects req.user; requireAdmin gates on the injected isAdmin so
// we can simulate non-admins. Storage runs against the test DB; supabase + rate
// limiters are mocked (no network).
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
  checkRsvpRateLimit: jest.fn(),
}));

// Mock the Overpass client so osm-search route tests never hit the network. The
// client's own parsing is covered by overpass.integration.test.ts.
jest.mock("../overpass", () => ({
  searchOverpass: jest.fn(),
  OverpassError: class OverpassError extends Error {},
}));

import { registerSafePlaceRoutes } from "../routes/safePlaces";
import { registerAdminRoutes } from "../routes/admin";
import { checkAdminMutationRateLimit, checkRsvpRateLimit } from "../rateLimit";
import { searchOverpass, OverpassError } from "../overpass";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, safePlaces, safePlaceSaves, auditLog } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";

const overpassMock = searchOverpass as unknown as jest.Mock;

const app = express();
app.use(express.json());
registerSafePlaceRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;
const rsvpRl = checkRsvpRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdSafePlaceIds: string[] = [];

function uniqueEmail(): string {
  return `sp+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

type SeedInput = {
  name?: string;
  category?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

async function seedPlace(
  actorId: string,
  over: SeedInput = {},
): Promise<string> {
  const row = await storage.createSafePlace(
    {
      name: over.name ?? "Tęczowa Kawiarnia",
      category: over.category ?? "cafe",
      city: over.city,
      address: over.address,
      latitude: over.latitude,
      longitude: over.longitude,
    },
    actorId,
    null,
  );
  createdSafePlaceIds.push(row.id);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
  rsvpRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  jest.clearAllMocks();
  if (createdSafePlaceIds.length) {
    await db
      .delete(safePlaces)
      .where(inArray(safePlaces.id, createdSafePlaceIds));
  }
  if (createdUserIds.length) {
    // Also drop any bulk-imported rows created by these test users (their ids
    // aren't individually tracked). createdById SET NULL wouldn't remove them.
    await db
      .delete(safePlaces)
      .where(inArray(safePlaces.createdById, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdSafePlaceIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/safe-places", () => {
  it("unauth → 401", async () => {
    const res = await request(app).get("/api/v1/safe-places");
    expect(res.status).toBe(401);
  });

  it("lists visible places with the offset envelope", async () => {
    const admin = await seedUser();
    const a = await seedPlace(admin, { name: "Alpha", city: "Warszawa" });
    mockUser = { id: admin, isAdmin: false };

    const res = await request(app).get("/api/v1/safe-places?pageSize=50");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(typeof res.body.total).toBe("number");
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(a);
  });

  it("filters by category and by city", async () => {
    const admin = await seedUser();
    const cafe = await seedPlace(admin, { category: "cafe", city: "Kraków" });
    const club = await seedPlace(admin, { category: "club", city: "Gdańsk" });
    mockUser = { id: admin, isAdmin: false };

    const byCat = await request(app).get(
      "/api/v1/safe-places?category=cafe&pageSize=50",
    );
    const catIds = byCat.body.data.map((p: { id: string }) => p.id);
    expect(catIds).toContain(cafe);
    expect(catIds).not.toContain(club);

    const byCity = await request(app).get(
      "/api/v1/safe-places?city=gdańsk&pageSize=50", // case-insensitive
    );
    const cityIds = byCity.body.data.map((p: { id: string }) => p.id);
    expect(cityIds).toContain(club);
    expect(cityIds).not.toContain(cafe);
  });

  it("search → case-insensitive substring over name, city and address", async () => {
    const admin = await seedUser();
    const byName = await seedPlace(admin, {
      name: "Tęczowy Zakątek",
      city: "Warszawa",
    });
    const byCity = await seedPlace(admin, {
      name: "Kawiarnia Pod Różą",
      city: "Wrocław",
    });
    const byAddr = await seedPlace(admin, {
      name: "Klub Nocny",
      city: "Kraków",
      address: "ul. Tęczowa 5",
    });
    const noMatch = await seedPlace(admin, {
      name: "Biblioteka",
      city: "Łódź",
    });
    mockUser = { id: admin, isAdmin: false };

    // Partial, lower-case term matches the NAME ("tęcz" ⊂ "Tęczowy") and the
    // ADDRESS ("ul. Tęczowa 5") — but not the unrelated rows.
    const res = await request(app).get(
      "/api/v1/safe-places?search=t%C4%99cz&pageSize=50", // "tęcz"
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([byName, byAddr]));
    expect(ids).not.toContain(byCity);
    expect(ids).not.toContain(noMatch);

    // A term that only matches a CITY still hits.
    const byCityRes = await request(app).get(
      "/api/v1/safe-places?search=wroc&pageSize=50",
    );
    const cityIds = byCityRes.body.data.map((p: { id: string }) => p.id);
    expect(cityIds).toContain(byCity);
    expect(cityIds).not.toContain(byName);
  });

  it("search → LIKE metachars are treated literally (no wildcard injection)", async () => {
    const admin = await seedUser();
    const literal = await seedPlace(admin, { name: "50% Klub", city: "Sopot" });
    const other = await seedPlace(admin, { name: "Setka Bar", city: "Sopot" });
    mockUser = { id: admin, isAdmin: false };

    // "%" must match the literal char, not act as a wildcard that returns all.
    const res = await request(app).get(
      "/api/v1/safe-places?search=%25&pageSize=50", // "%"
    );
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(literal);
    expect(ids).not.toContain(other);
  });

  it("near → orders nearest-first, null-coordinate rows last", async () => {
    const admin = await seedUser();
    // Warsaw / Kraków / Gdańsk + one with no coordinates.
    const warsaw = await seedPlace(admin, {
      name: "Warsaw",
      latitude: 52.23,
      longitude: 21.01,
    });
    const gdansk = await seedPlace(admin, {
      name: "Gdansk",
      latitude: 54.35,
      longitude: 18.65,
    });
    const noCoords = await seedPlace(admin, { name: "NoCoords" });
    mockUser = { id: admin, isAdmin: false };

    // A point right next to Warsaw.
    const res = await request(app).get(
      "/api/v1/safe-places?near=52.2,21.0&pageSize=50",
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    // Warsaw is nearest → before Gdańsk; the null-coord place sorts after both.
    expect(ids.indexOf(warsaw)).toBeLessThan(ids.indexOf(gdansk));
    expect(ids.indexOf(gdansk)).toBeLessThan(ids.indexOf(noCoords));
  });

  it("invalid near → 400 (malformed and out-of-range)", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: false };
    // incl. empty components — Number("") is 0, so these must NOT slip through
    for (const bad of [
      "abc",
      "52.2",
      "999,21",
      "52.2,500",
      ",",
      "52.2,",
      ",21",
      " , ",
    ]) {
      const res = await request(app).get(
        `/api/v1/safe-places?near=${encodeURIComponent(bad)}`,
      );
      expect(res.status).toBe(400);
    }
  });

  it("paginates deterministically across duplicate city+name rows", async () => {
    const admin = await seedUser();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(await seedPlace(admin, { name: "Dup", city: "Łódź" }));
    mockUser = { id: admin, isAdmin: false };

    const p1 = await request(app).get(
      "/api/v1/safe-places?city=Łódź&pageSize=2&page=1",
    );
    const p2 = await request(app).get(
      "/api/v1/safe-places?city=Łódź&pageSize=2&page=2",
    );
    const seen = [
      ...p1.body.data.map((p: { id: string }) => p.id),
      ...p2.body.data.map((p: { id: string }) => p.id),
    ];
    // no duplicates across pages; all three seeded rows covered
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of ids) expect(seen).toContain(id);
  });

  it("excludes soft-deleted places", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin, { city: "Poznań" });
    await storage.softDeleteSafePlace(p, admin, null);
    mockUser = { id: admin, isAdmin: false };

    const res = await request(app).get("/api/v1/safe-places?pageSize=50");
    const ids = res.body.data.map((x: { id: string }) => x.id);
    expect(ids).not.toContain(p);
  });
});

describe("GET /api/v1/safe-places/:id", () => {
  it("200 with the DTO; 404 missing/deleted; bad uuid → 400", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin, { latitude: 52.2, longitude: 21.0 });
    mockUser = { id: admin, isAdmin: false };

    const ok = await request(app).get(`/api/v1/safe-places/${p}`);
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(p);
    expect(ok.body.latitude).toBeCloseTo(52.2);

    const missing = await request(app).get(
      `/api/v1/safe-places/${randomUUID()}`,
    );
    expect(missing.status).toBe(404);

    await storage.softDeleteSafePlace(p, admin, null);
    const deleted = await request(app).get(`/api/v1/safe-places/${p}`);
    expect(deleted.status).toBe(404);

    const bad = await request(app).get("/api/v1/safe-places/not-a-uuid");
    expect(bad.status).toBe(400);
  });
});

describe("safe-place save / unsave + GET /api/v1/safe-places/saved", () => {
  it("save is idempotent, sets the caller's saved flag, and unsave clears it", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin, { city: "Warszawa" });
    mockUser = { id: admin, isAdmin: false };

    // Save twice → 200 each, exactly one row (idempotent).
    const s1 = await request(app).post(`/api/v1/safe-places/${p}/save`);
    const s2 = await request(app).post(`/api/v1/safe-places/${p}/save`);
    expect(s1.status).toBe(200);
    expect(s2.status).toBe(200);
    const rows = await db
      .select()
      .from(safePlaceSaves)
      .where(
        and(
          eq(safePlaceSaves.safePlaceId, p),
          eq(safePlaceSaves.userId, admin),
        ),
      );
    expect(rows).toHaveLength(1);

    // The DTO's private `saved` flag reflects it on the read path.
    const got = await request(app).get(`/api/v1/safe-places/${p}`);
    expect(got.body.saved).toBe(true);
    const listed = await request(app).get("/api/v1/safe-places?pageSize=50");
    expect(listed.body.data.find((x: { id: string }) => x.id === p).saved).toBe(
      true,
    );

    // Unsave → 200, row gone, flag false; unsave again → still 200 (idempotent).
    const u1 = await request(app).delete(`/api/v1/safe-places/${p}/save`);
    expect(u1.status).toBe(200);
    const after = await db
      .select()
      .from(safePlaceSaves)
      .where(eq(safePlaceSaves.safePlaceId, p));
    expect(after).toHaveLength(0);
    const u2 = await request(app).delete(`/api/v1/safe-places/${p}/save`);
    expect(u2.status).toBe(200);
    const got2 = await request(app).get(`/api/v1/safe-places/${p}`);
    expect(got2.body.saved).toBe(false);
  });

  it("save on a missing / soft-deleted place → 404; bad uuid → 400", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    await storage.softDeleteSafePlace(p, admin, null);
    mockUser = { id: admin, isAdmin: false };

    const gone = await request(app).post(`/api/v1/safe-places/${p}/save`);
    expect(gone.status).toBe(404);
    const missing = await request(app).post(
      `/api/v1/safe-places/${randomUUID()}/save`,
    );
    expect(missing.status).toBe(404);
    const bad = await request(app).post("/api/v1/safe-places/not-a-uuid/save");
    expect(bad.status).toBe(400);
  });

  it("GET /saved returns the caller's saved places, caller-scoped, excluding deleted", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const a = await seedPlace(owner, { name: "Alpha", city: "Warszawa" });
    const b = await seedPlace(owner, { name: "Beta", city: "Kraków" });
    const gone = await seedPlace(owner, { name: "Gone", city: "Gdańsk" });

    // owner saves a + gone; other saves b.
    mockUser = { id: owner, isAdmin: false };
    await request(app).post(`/api/v1/safe-places/${a}/save`);
    await request(app).post(`/api/v1/safe-places/${gone}/save`);
    mockUser = { id: other, isAdmin: false };
    await request(app).post(`/api/v1/safe-places/${b}/save`);
    // gone is soft-deleted after saving → excluded from the saved list.
    await storage.softDeleteSafePlace(gone, owner, null);

    mockUser = { id: owner, isAdmin: false };
    const res = await request(app).get("/api/v1/safe-places/saved");
    expect(res.status).toBe(200);
    const ids = res.body.map((x: { id: string }) => x.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(gone); // soft-deleted
    expect(ids).not.toContain(b); // other user's save (caller-scoped)
    expect(res.body.every((x: { saved: boolean }) => x.saved === true)).toBe(
      true,
    );
  });

  it("save + unsave are rate-limited → 429 (each verb)", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    mockUser = { id: admin, isAdmin: false };

    rsvpRl.mockResolvedValueOnce({ allowed: false, retryAfter: 9 });
    const saveRes = await request(app).post(`/api/v1/safe-places/${p}/save`);
    expect(saveRes.status).toBe(429);
    expect(saveRes.body.retryAfter).toBe(9);

    rsvpRl.mockResolvedValueOnce({ allowed: false, retryAfter: 11 });
    const unsaveRes = await request(app).delete(
      `/api/v1/safe-places/${p}/save`,
    );
    expect(unsaveRes.status).toBe(429);
    expect(unsaveRes.body.retryAfter).toBe(11);
  });

  it("save / unsave write NO audit_log rows (benign private toggle)", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    mockUser = { id: admin, isAdmin: false };

    await request(app).post(`/api/v1/safe-places/${p}/save`);
    await request(app).delete(`/api/v1/safe-places/${p}/save`);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, admin));
    // Only the seed's safe_place.created audit exists — no save/unsave action.
    expect(audits.some((a) => a.action.startsWith("safe_place.save"))).toBe(
      false,
    );
  });
});

describe("GDPR: erasure + export cover saved bookmarks", () => {
  it("eraseUser deletes the user's event_saves AND safe_place_saves (real erasure path)", async () => {
    const owner = await seedUser();
    const user = await seedUser();
    const p = await seedPlace(owner);
    // Save a place as `user`, then run the REAL erasure (anonymise-in-place).
    mockUser = { id: user, isAdmin: false };
    await request(app).post(`/api/v1/safe-places/${p}/save`);
    let rows = await db
      .select()
      .from(safePlaceSaves)
      .where(eq(safePlaceSaves.userId, user));
    expect(rows).toHaveLength(1);

    await storage.eraseUser(user);

    rows = await db
      .select()
      .from(safePlaceSaves)
      .where(eq(safePlaceSaves.userId, user));
    expect(rows).toHaveLength(0); // erased even though the user row survives
  });

  it("getAccountExport includes the caller's saved safe places", async () => {
    const owner = await seedUser();
    const p = await seedPlace(owner, { name: "Zapisane Miejsce" });
    mockUser = { id: owner, isAdmin: false };
    await request(app).post(`/api/v1/safe-places/${p}/save`);

    const data = await storage.getAccountExport(owner);
    const savedIds = data.savedSafePlaces.map((x) => x.id);
    expect(savedIds).toContain(p);
    const row = data.savedSafePlaces.find((x) => x.id === p);
    expect(row?.name).toBe("Zapisane Miejsce");
    expect(row?.savedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/admin/safe-places", () => {
  const body = {
    name: "  Klub Tolerancja  ",
    category: "club",
    city: "Wrocław",
    latitude: 51.11,
    longitude: 17.03,
  };

  it("admin creates → 201 + DTO (trimmed), audited IDs-only", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app).post("/api/admin/safe-places").send(body);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Klub Tolerancja"); // trimmed
    expect(res.body.category).toBe("club");
    createdSafePlaceIds.push(res.body.id);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(audit.action).toBe("safe_place.created");
    expect(audit.resourceType).toBe("safe_place");
    expect(audit.actorId).toBe(admin);
    expect(audit.metadata).toBeNull(); // no name/category/address/city/coords
  });

  it("non-admin → 403", async () => {
    const user = await seedUser();
    mockUser = { id: user, isAdmin: false };
    const res = await request(app).post("/api/admin/safe-places").send(body);
    expect(res.status).toBe(403);
  });

  it("rejects missing name / bad category / one-sided or out-of-range coords → 400", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const bad: Record<string, unknown>[] = [
      { category: "club" }, // no name
      { name: "X", category: "gay" }, // identity/free-text category rejected
      { name: "X", category: "club", latitude: 51.1 }, // one-sided coord
      { name: "X", category: "club", latitude: 200, longitude: 17 }, // out of range
    ];
    for (const b of bad) {
      const res = await request(app).post("/api/admin/safe-places").send(b);
      expect(res.status).toBe(400);
    }
  });

  it("rate-limited → 429", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).post("/api/admin/safe-places").send(body);
    expect(res.status).toBe(429);
  });
});

describe("PATCH /api/admin/safe-places/:id", () => {
  it("updates → 200; empty body → 400; one-sided coord → 400; 404; audited", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin, { name: "Old", category: "cafe" });
    mockUser = { id: admin, isAdmin: true };

    const ok = await request(app)
      .patch(`/api/admin/safe-places/${p}`)
      .send({ name: "New", category: "bar" });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe("New");
    expect(ok.body.category).toBe("bar");

    const empty = await request(app)
      .patch(`/api/admin/safe-places/${p}`)
      .send({});
    expect(empty.status).toBe(400);

    const oneSided = await request(app)
      .patch(`/api/admin/safe-places/${p}`)
      .send({ latitude: 51.1 });
    expect(oneSided.status).toBe(400);

    const missing = await request(app)
      .patch(`/api/admin/safe-places/${randomUUID()}`)
      .send({ name: "x" });
    expect(missing.status).toBe(404);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, p));
    expect(audits.some((a) => a.action === "safe_place.updated")).toBe(true);
  });

  it("non-admin → 403", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    const user = await seedUser();
    mockUser = { id: user, isAdmin: false };
    const res = await request(app)
      .patch(`/api/admin/safe-places/${p}`)
      .send({ name: "x" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/safe-places/:id", () => {
  it("soft-deletes (then excluded); repeat → 404; audited", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    mockUser = { id: admin, isAdmin: true };

    const del = await request(app).delete(`/api/admin/safe-places/${p}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // gone from the user list
    mockUser = { id: admin, isAdmin: false };
    const list = await request(app).get("/api/v1/safe-places?pageSize=50");
    expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(p);

    // idempotent-safe: second delete → 404
    mockUser = { id: admin, isAdmin: true };
    const again = await request(app).delete(`/api/admin/safe-places/${p}`);
    expect(again.status).toBe(404);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, p));
    expect(audits.some((a) => a.action === "safe_place.deleted")).toBe(true);
  });

  it("non-admin → 403", async () => {
    const admin = await seedUser();
    const p = await seedPlace(admin);
    const user = await seedUser();
    mockUser = { id: user, isAdmin: false };
    const res = await request(app).delete(`/api/admin/safe-places/${p}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/safe-places/osm-search (SP-2)", () => {
  const body = { city: "Warszawa", category: "cafe" };

  it("admin → 200 with the Overpass candidates", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    overpassMock.mockResolvedValueOnce([
      {
        osmId: "node/1",
        name: "Kawiarnia",
        category: "cafe",
        address: "Marszałkowska 10",
        latitude: 52.23,
        longitude: 21.01,
      },
    ]);
    const res = await request(app)
      .post("/api/admin/safe-places/osm-search")
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].osmId).toBe("node/1");
    expect(overpassMock).toHaveBeenCalledWith("Warszawa", "cafe");
  });

  it("Overpass failure → 502 (never a 500 stack leak)", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    overpassMock.mockRejectedValueOnce(
      new OverpassError("overpass_status_429"),
    );
    const res = await request(app)
      .post("/api/admin/safe-places/osm-search")
      .send(body);
    expect(res.status).toBe(502);
  });

  it("non-admin → 403; missing city / bad category → 400; rate-limited → 429", async () => {
    const user = await seedUser();
    mockUser = { id: user, isAdmin: false };
    expect(
      (await request(app).post("/api/admin/safe-places/osm-search").send(body))
        .status,
    ).toBe(403);

    mockUser = { id: user, isAdmin: true };
    expect(
      (
        await request(app)
          .post("/api/admin/safe-places/osm-search")
          .send({ category: "cafe" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/admin/safe-places/osm-search")
          .send({ city: "X", category: "gay" })
      ).status,
    ).toBe(400);

    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect(
      (await request(app).post("/api/admin/safe-places/osm-search").send(body))
        .status,
    ).toBe(429);
  });
});

describe("POST /api/admin/safe-places/bulk (SP-2)", () => {
  const item = (osmId: string, over = {}) => ({
    name: "Miejsce",
    category: "cafe",
    city: "Warszawa",
    latitude: 52.2,
    longitude: 21.0,
    osmId,
    ...over,
  });

  it("admin → creates all + audits IDs-only", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const res = await request(app)
      .post("/api/admin/safe-places/bulk")
      .send([item("node/10"), item("node/11")]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: 2, skipped: 0 });

    const rows = await db
      .select()
      .from(safePlaces)
      .where(eq(safePlaces.createdById, admin));
    expect(rows).toHaveLength(2);
    const audits = await db
      .select()
      .from(auditLog)
      .where(inArray(auditLog.actorId, [admin]));
    const created = audits.filter((a) => a.action === "safe_place.created");
    expect(created).toHaveLength(2);
    expect(created.every((a) => a.metadata === null)).toBe(true);
  });

  it("dedupes an already-imported osmId (skipped, one DB row)", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    await request(app)
      .post("/api/admin/safe-places/bulk")
      .send([item("node/20")]);
    const res = await request(app)
      .post("/api/admin/safe-places/bulk")
      .send([item("node/20", { name: "Inna nazwa" })]);
    expect(res.body).toEqual({ created: 0, skipped: 1 });

    const rows = await db
      .select()
      .from(safePlaces)
      .where(eq(safePlaces.osmId, "node/20"));
    expect(rows).toHaveLength(1);
  });

  it("drops within-request duplicate osmIds", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const res = await request(app)
      .post("/api/admin/safe-places/bulk")
      .send([item("node/30"), item("node/30")]);
    expect(res.body).toEqual({ created: 1, skipped: 1 });
  });

  it("rejects bad items: bad category / one-sided coord / bad osmId / empty → 400", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const bad: object[] = [
      [{ name: "X", category: "gay" }],
      [{ name: "X", category: "cafe", latitude: 52.2 }], // one-sided coord
      [{ name: "X", category: "cafe", osmId: "not-an-osm-id" }],
      [], // empty array
    ];
    for (const b of bad) {
      const res = await request(app)
        .post("/api/admin/safe-places/bulk")
        .send(b);
      expect(res.status).toBe(400);
    }
  });

  it("non-admin → 403; rate-limited → 429", async () => {
    const user = await seedUser();
    mockUser = { id: user, isAdmin: false };
    expect(
      (
        await request(app)
          .post("/api/admin/safe-places/bulk")
          .send([item("node/40")])
      ).status,
    ).toBe(403);

    mockUser = { id: user, isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect(
      (
        await request(app)
          .post("/api/admin/safe-places/bulk")
          .send([item("node/41")])
      ).status,
    ).toBe(429);
  });
});
