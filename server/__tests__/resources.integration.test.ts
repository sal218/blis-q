import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for resources (docs/API.md §11/§14).
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
  checkReportRateLimit: jest.fn(),
}));

// admin.ts imports these at module load; mock so no network / R2 env is needed.
jest.mock("../overpass", () => ({
  searchOverpass: jest.fn(),
  OverpassError: class OverpassError extends Error {},
}));
jest.mock("../objectStorage", () => ({
  createUploadUrl: jest.fn(),
  confirmUpload: jest.fn(),
  getDownloadUrl: jest.fn(),
  ALLOWED_IMAGE_CONTENT_TYPES: ["image/jpeg", "image/png", "image/webp"],
}));

import { registerResourceRoutes } from "../routes/resources";
import { registerAdminRoutes } from "../routes/admin";
import { checkAdminMutationRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, resources, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerResourceRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdResourceIds: string[] = [];

function uniqueEmail(): string {
  return `res+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedResource(
  actorId: string,
  over: {
    title?: string;
    category?: string;
    body?: string;
    url?: string;
    featured?: boolean;
  } = {},
): Promise<string> {
  const row = await storage.createResource(
    {
      title: over.title ?? "Poradnik praw",
      category: over.category ?? "legal_rights",
      body: over.body ?? "Treść poradnika.",
      url: over.url,
      featured: over.featured,
    },
    actorId,
    null,
  );
  createdResourceIds.push(row.id);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  jest.clearAllMocks();
  if (createdResourceIds.length) {
    await db.delete(resources).where(inArray(resources.id, createdResourceIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(resources)
      .where(inArray(resources.createdById, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdResourceIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/resources", () => {
  it("401 without auth", async () => {
    const res = await request(app).get("/api/v1/resources");
    expect(res.status).toBe(401);
  });

  it("returns an offset page of visible resources", async () => {
    const admin = await seedUser();
    await seedResource(admin, {
      title: "Zdrowie psychiczne",
      category: "mental_health",
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/resources");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.total).toBe("number");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(
      res.body.data.some(
        (r: { title: string }) => r.title === "Zdrowie psychiczne",
      ),
    ).toBe(true);
  });

  it("filters by category", async () => {
    const admin = await seedUser();
    await seedResource(admin, { title: "Legal one", category: "legal_rights" });
    await seedResource(admin, { title: "Mind one", category: "mental_health" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/resources")
      .query({ category: "mental_health" });
    expect(res.status).toBe(200);
    const titles = res.body.data.map((r: { title: string }) => r.title);
    expect(titles).toContain("Mind one");
    expect(titles).not.toContain("Legal one");
  });

  it("searches over the title (case-insensitive) and excludes non-matches", async () => {
    const admin = await seedUser();
    const tok = `Zxq${Date.now()}`;
    const hit = await seedResource(admin, {
      title: `Telefon ${tok} zaufania`,
    });
    const miss = await seedResource(admin, { title: "Zupełnie inny wpis" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/resources")
      .query({ search: tok.toLowerCase() });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(hit);
    expect(ids).not.toContain(miss);
  });

  it("searches over the body too", async () => {
    const admin = await seedUser();
    const tok = `Bod${Date.now()}`;
    const id = await seedResource(admin, {
      title: "Poradnik",
      body: `Zawiera ${tok} w treści.`,
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/resources")
      .query({ search: tok });
    expect(res.body.data.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("treats LIKE metacharacters as literal (escaped)", async () => {
    const admin = await seedUser();
    const stamp = Date.now();
    const literal = await seedResource(admin, { title: `Rabat_${stamp}` });
    const wildcard = await seedResource(admin, { title: `RabatX${stamp}` });
    mockUser = { id: await seedUser(), isAdmin: false };

    // "_" must match a literal underscore, NOT any character → only `literal`.
    const res = await request(app)
      .get("/api/v1/resources")
      .query({ search: `Rabat_${stamp}` });
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(literal);
    expect(ids).not.toContain(wildcard);
  });

  it("combines search with the category filter", async () => {
    const admin = await seedUser();
    const tok = `Cmb${Date.now()}`;
    const mental = await seedResource(admin, {
      title: `${tok} umysł`,
      category: "mental_health",
    });
    const legal = await seedResource(admin, {
      title: `${tok} prawo`,
      category: "legal_rights",
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/resources")
      .query({ search: tok, category: "mental_health" });
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(mental);
    expect(ids).not.toContain(legal);
  });

  it("rejects a blank/whitespace search with 400", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .get("/api/v1/resources")
      .query({ search: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-set category with 400", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .get("/api/v1/resources")
      .query({ category: "not_a_category" });
    expect(res.status).toBe(400);
  });

  it("excludes soft-deleted resources", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin, { title: "To be deleted" });
    await storage.softDeleteResource(id, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/resources");
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { id: string }) => r.id === id)).toBe(false);
  });
});

describe("GET /api/v1/resources/:id", () => {
  it("returns the DTO for a visible resource", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin, {
      title: "Poradnik",
      url: "https://kph.org.pl",
      featured: true,
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/resources/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.url).toBe("https://kph.org.pl");
    expect(res.body.featured).toBe(true);
  });

  it("404 for a missing / soft-deleted resource", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin);
    await storage.softDeleteResource(id, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    expect((await request(app).get(`/api/v1/resources/${id}`)).status).toBe(
      404,
    );
    expect(
      (await request(app).get(`/api/v1/resources/${randomUUID()}`)).status,
    ).toBe(404);
  });

  it("400 on a bad uuid", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect(
      (await request(app).get("/api/v1/resources/not-a-uuid")).status,
    ).toBe(400);
  });
});

describe("POST /api/admin/resources", () => {
  const body = {
    title: "  Prawa osób LGBT  ",
    category: "legal_rights",
    body: "Przewodnik po prawach.",
    url: "https://kph.org.pl",
  };

  it("admin creates → 201 + trimmed DTO, audited IDs-only", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app).post("/api/admin/resources").send(body);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Prawa osób LGBT"); // trimmed
    expect(res.body.category).toBe("legal_rights");
    expect(res.body.featured).toBe(false); // default
    createdResourceIds.push(res.body.id);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(audit.action).toBe("resource.created");
    expect(audit.resourceType).toBe("resource");
    expect(audit.actorId).toBe(admin);
    expect(audit.metadata).toBeNull();
  });

  it("non-admin → 403", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect(
      (await request(app).post("/api/admin/resources").send(body)).status,
    ).toBe(403);
  });

  it("bad input → 400 (out-of-set category)", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post("/api/admin/resources")
      .send({ ...body, category: "nope" });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).post("/api/admin/resources").send(body);
    expect(res.status).toBe(429);
  });
});

describe("PATCH /api/admin/resources/:id", () => {
  it("updates and audits resource.updated", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin, { title: "Old" });
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/resources/${id}`)
      .send({ title: "New", featured: true });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New");
    expect(res.body.featured).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "resource.updated")).toBe(true);
  });

  it("empty body → 400", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin);
    mockUser = { id: admin, isAdmin: true };
    expect(
      (await request(app).patch(`/api/admin/resources/${id}`).send({})).status,
    ).toBe(400);
  });

  it("404 for a missing resource", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/resources/${randomUUID()}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/resources/:id", () => {
  it("soft-deletes → 200, then hidden + repeat 404; audits resource.deleted", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin);
    mockUser = { id: admin, isAdmin: true };

    const del = await request(app).delete(`/api/admin/resources/${id}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // No longer visible to a user.
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).get(`/api/v1/resources/${id}`)).status).toBe(
      404,
    );

    // Idempotent: deleting again → 404.
    mockUser = { id: admin, isAdmin: true };
    expect(
      (await request(app).delete(`/api/admin/resources/${id}`)).status,
    ).toBe(404);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "resource.deleted")).toBe(true);
  });

  it("non-admin → 403", async () => {
    const admin = await seedUser();
    const id = await seedResource(admin);
    mockUser = { id: await seedUser(), isAdmin: false };
    expect(
      (await request(app).delete(`/api/admin/resources/${id}`)).status,
    ).toBe(403);
  });
});
