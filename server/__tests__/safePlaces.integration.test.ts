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
}));

import { registerSafePlaceRoutes } from "../routes/safePlaces";
import { registerAdminRoutes } from "../routes/admin";
import { checkAdminMutationRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, safePlaces, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerSafePlaceRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;

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
});

afterEach(async () => {
  if (createdSafePlaceIds.length) {
    await db
      .delete(safePlaces)
      .where(inArray(safePlaces.id, createdSafePlaceIds));
  }
  if (createdUserIds.length) {
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
