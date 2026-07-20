import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for news (P-31, docs/API.md §11/§14).
// isAuthenticated injects req.user; requireAdmin gates on the injected isAdmin so
// we can simulate non-admins. Storage runs against the test DB; supabase + rate
// limiters are mocked (no network). Mirrors resources.integration.test.ts.
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

import { registerNewsRoutes } from "../routes/news";
import { registerAdminRoutes } from "../routes/admin";
import { checkAdminMutationRateLimit } from "../rateLimit";
import {
  createUploadUrl,
  confirmUpload,
  getDownloadUrl,
} from "../objectStorage";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, news, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerNewsRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;
const createUploadUrlMock = createUploadUrl as unknown as jest.Mock;
const confirmUploadMock = confirmUpload as unknown as jest.Mock;
const getDownloadUrlMock = getDownloadUrl as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdNewsIds: string[] = [];

function uniqueEmail(): string {
  return `news+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedNews(
  actorId: string,
  over: {
    title?: string;
    summary?: string;
    body?: string;
    category?: string;
    source?: string;
    sourceUrl?: string;
    featured?: boolean;
  } = {},
): Promise<string> {
  const row = await storage.createNews(
    {
      title: over.title ?? "Nowa ustawa",
      summary: over.summary ?? "Krótkie streszczenie wiadomości.",
      body: over.body ?? "Pełna treść artykułu redakcyjnego.",
      category: over.category ?? "rights",
      source: over.source ?? "Blis-Q Redakcja",
      sourceUrl: over.sourceUrl,
      featured: over.featured,
    },
    actorId,
    null,
  );
  createdNewsIds.push(row.id);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
  confirmUploadMock.mockResolvedValue(true);
  getDownloadUrlMock.mockImplementation(
    async (_asset: string, key: string) => `https://signed.example/${key}`,
  );
  createUploadUrlMock.mockResolvedValue({
    uploadUrl: "https://r2.example/put",
    key: randomUUID(),
  });
});

afterEach(async () => {
  jest.clearAllMocks();
  if (createdNewsIds.length) {
    await db.delete(news).where(inArray(news.id, createdNewsIds));
  }
  if (createdUserIds.length) {
    await db.delete(news).where(inArray(news.createdById, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdNewsIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/news", () => {
  it("401 without auth", async () => {
    const res = await request(app).get("/api/v1/news");
    expect(res.status).toBe(401);
  });

  it("returns an offset page of visible news", async () => {
    const admin = await seedUser();
    await seedNews(admin, { title: "Parlament UE", category: "world" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/news");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.total).toBe("number");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(
      res.body.data.some((r: { title: string }) => r.title === "Parlament UE"),
    ).toBe(true);
  });

  it("filters by category", async () => {
    const admin = await seedUser();
    await seedNews(admin, { title: "Rights one", category: "rights" });
    await seedNews(admin, { title: "Health one", category: "health" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/news")
      .query({ category: "health" });
    expect(res.status).toBe(200);
    const titles = res.body.data.map((r: { title: string }) => r.title);
    expect(titles).toContain("Health one");
    expect(titles).not.toContain("Rights one");
  });

  it("searches over the title (case-insensitive) and excludes non-matches", async () => {
    const admin = await seedUser();
    const tok = `Zxq${Date.now()}`;
    const hit = await seedNews(admin, { title: `Marsz ${tok} Równości` });
    const miss = await seedNews(admin, { title: "Zupełnie inny nagłówek" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/news")
      .query({ search: tok.toLowerCase() });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(hit);
    expect(ids).not.toContain(miss);
  });

  it("searches over the summary", async () => {
    const admin = await seedUser();
    const tok = `Sum${Date.now()}`;
    const id = await seedNews(admin, {
      title: "Nagłówek",
      summary: `W streszczeniu jest ${tok}.`,
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/news").query({ search: tok });
    expect(res.body.data.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("searches over the body too", async () => {
    const admin = await seedUser();
    const tok = `Bod${Date.now()}`;
    const id = await seedNews(admin, {
      title: "Nagłówek",
      body: `Zawiera ${tok} w treści.`,
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/news").query({ search: tok });
    expect(res.body.data.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("treats LIKE metacharacters as literal (escaped)", async () => {
    const admin = await seedUser();
    const stamp = Date.now();
    const literal = await seedNews(admin, { title: `Ustawa_${stamp}` });
    const wildcard = await seedNews(admin, { title: `UstawaX${stamp}` });
    mockUser = { id: await seedUser(), isAdmin: false };

    // "_" must match a literal underscore, NOT any character → only `literal`.
    const res = await request(app)
      .get("/api/v1/news")
      .query({ search: `Ustawa_${stamp}` });
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(literal);
    expect(ids).not.toContain(wildcard);
  });

  it("combines search with the category filter", async () => {
    const admin = await seedUser();
    const tok = `Cmb${Date.now()}`;
    const health = await seedNews(admin, {
      title: `${tok} zdrowie`,
      category: "health",
    });
    const rights = await seedNews(admin, {
      title: `${tok} prawa`,
      category: "rights",
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app)
      .get("/api/v1/news")
      .query({ search: tok, category: "health" });
    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(health);
    expect(ids).not.toContain(rights);
  });

  it("rejects a blank/whitespace search with 400", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app).get("/api/v1/news").query({ search: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-set category with 400", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .get("/api/v1/news")
      .query({ category: "not_a_category" });
    expect(res.status).toBe(400);
  });

  it("excludes soft-deleted news", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin, { title: "To be deleted" });
    await storage.softDeleteNews(id, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get("/api/v1/news");
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: { id: string }) => r.id === id)).toBe(false);
  });
});

describe("GET /api/v1/news/:id", () => {
  it("returns the DTO for an editorial item (full body, no external link)", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin, {
      title: "Rezolucja",
      summary: "Streszczenie.",
      body: "Pełna treść redakcyjna.",
      featured: true,
    });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.summary).toBe("Streszczenie.");
    expect(res.body.body).toBe("Pełna treść redakcyjna.");
    expect(res.body.source).toBe("Blis-Q Redakcja");
    expect(res.body.sourceUrl).toBeNull();
    expect(res.body.imageUrl).toBeNull(); // signing lands in a later slice
    expect(res.body.featured).toBe(true);
  });

  it("returns the DTO for an externally-sourced item (summary + link, null body)", async () => {
    const admin = await seedUser();
    const row = await storage.createNews(
      {
        title: "Nowy projekt ustawy",
        summary: "Rząd przyjął projekt.",
        // no body — external item
        category: "rights",
        source: "OKO.press",
        sourceUrl: "https://oko.press/artykul",
      },
      admin,
      null,
    );
    createdNewsIds.push(row.id);
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${row.id}`);
    expect(res.status).toBe(200);
    expect(res.body.body).toBeNull();
    expect(res.body.source).toBe("OKO.press");
    expect(res.body.sourceUrl).toBe("https://oko.press/artykul");
  });

  it("404 for a missing / soft-deleted news item", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    await storage.softDeleteNews(id, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    expect((await request(app).get(`/api/v1/news/${id}`)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/news/${randomUUID()}`)).status,
    ).toBe(404);
  });

  it("400 on a bad uuid", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).get("/api/v1/news/not-a-uuid")).status).toBe(
      400,
    );
  });
});

describe("GET /api/v1/news/:id/related", () => {
  // Force distinct createdAt so recency ordering is deterministic (later ts =
  // newer). AR-2: tests may touch the DB directly.
  async function setCreatedAt(id: string, iso: string): Promise<void> {
    await db
      .update(news)
      .set({ createdAt: new Date(iso) })
      .where(eq(news.id, id));
  }

  it("401 without auth", async () => {
    const res = await request(app).get(`/api/v1/news/${randomUUID()}/related`);
    expect(res.status).toBe(401);
  });

  it("returns same-category others FIRST, excludes self, newest-first", async () => {
    const admin = await seedUser();
    const self = await seedNews(admin, { title: "Self", category: "rights" });
    const r1 = await seedNews(admin, { title: "Rights A", category: "rights" });
    const r2 = await seedNews(admin, { title: "Rights B", category: "rights" });
    const w1 = await seedNews(admin, { title: "World A", category: "world" });
    await setCreatedAt(r1, "2026-01-01T00:00:00.000Z"); // older
    await setCreatedAt(r2, "2026-02-01T00:00:00.000Z"); // newer
    await setCreatedAt(w1, "2026-03-01T00:00:00.000Z"); // newest overall
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${self}/related`);
    expect(res.status).toBe(200);
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).not.toContain(self); // self excluded
    // Same-category (rights) first — newest rights before older — THEN world.
    expect(ids).toEqual([r2, r1, w1]);
  });

  it("tops up with other categories when same-category has no others", async () => {
    const admin = await seedUser();
    const self = await seedNews(admin, { title: "Lonely", category: "health" });
    const w1 = await seedNews(admin, { title: "W1", category: "world" });
    const w2 = await seedNews(admin, { title: "W2", category: "community" });
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${self}/related`);
    const ids = res.body.map((n: { id: string }) => n.id);
    expect(ids).toContain(w1);
    expect(ids).toContain(w2);
    expect(ids).not.toContain(self);
  });

  it("excludes soft-deleted articles", async () => {
    const admin = await seedUser();
    const self = await seedNews(admin, { category: "rights" });
    const gone = await seedNews(admin, { title: "Gone", category: "rights" });
    await storage.softDeleteNews(gone, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${self}/related`);
    expect(res.body.map((n: { id: string }) => n.id)).not.toContain(gone);
  });

  it("caps at 5 related", async () => {
    const admin = await seedUser();
    const self = await seedNews(admin, { category: "rights" });
    for (let i = 0; i < 7; i++) {
      await seedNews(admin, { title: `R${i}`, category: "rights" });
    }
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${self}/related`);
    expect(res.body.length).toBe(5);
  });

  it("404 for a missing / soft-deleted article; 400 on a bad uuid", async () => {
    const admin = await seedUser();
    const gone = await seedNews(admin);
    await storage.softDeleteNews(gone, admin, null);
    mockUser = { id: await seedUser(), isAdmin: false };

    expect(
      (await request(app).get(`/api/v1/news/${gone}/related`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/news/${randomUUID()}/related`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/news/not-a-uuid/related`)).status,
    ).toBe(400);
  });
});

describe("POST /api/admin/news", () => {
  const body = {
    title: "  Parlament Europejski  ",
    summary: "Rezolucja w sprawie praw osób LGBTQ+.",
    body: "Pełna treść artykułu.",
    category: "world",
    source: "Blis-Q Redakcja",
  };

  it("admin creates → 201 + trimmed DTO, audited IDs-only", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app).post("/api/admin/news").send(body);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Parlament Europejski"); // trimmed
    expect(res.body.category).toBe("world");
    expect(res.body.featured).toBe(false); // default
    createdNewsIds.push(res.body.id);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(audit.action).toBe("news.created");
    expect(audit.resourceType).toBe("news");
    expect(audit.actorId).toBe(admin);
    expect(audit.metadata).toBeNull();
  });

  it("non-admin → 403", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).post("/api/admin/news").send(body)).status).toBe(
      403,
    );
  });

  it("bad input → 400 (out-of-set category)", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post("/api/admin/news")
      .send({ ...body, category: "nope" });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).post("/api/admin/news").send(body);
    expect(res.status).toBe(429);
  });
});

describe("PATCH /api/admin/news/:id", () => {
  it("updates and audits news.updated", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin, { title: "Old" });
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/news/${id}`)
      .send({ title: "New", featured: true });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New");
    expect(res.body.featured).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "news.updated")).toBe(true);
  });

  it("clears the body when sent null", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin, { body: "Do usunięcia." });
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/news/${id}`)
      .send({ body: null });
    expect(res.status).toBe(200);
    expect(res.body.body).toBeNull();
  });

  it("empty body → 400", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    mockUser = { id: admin, isAdmin: true };
    expect(
      (await request(app).patch(`/api/admin/news/${id}`).send({})).status,
    ).toBe(400);
  });

  it("404 for a missing news item", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/news/${randomUUID()}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/news/:id", () => {
  it("soft-deletes → 200, then hidden + repeat 404; audits news.deleted", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    mockUser = { id: admin, isAdmin: true };

    const del = await request(app).delete(`/api/admin/news/${id}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // No longer visible to a user.
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).get(`/api/v1/news/${id}`)).status).toBe(404);

    // Idempotent: deleting again → 404.
    mockUser = { id: admin, isAdmin: true };
    expect((await request(app).delete(`/api/admin/news/${id}`)).status).toBe(
      404,
    );

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "news.deleted")).toBe(true);
  });

  it("non-admin → 403", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).delete(`/api/admin/news/${id}`)).status).toBe(
      403,
    );
  });
});

describe("POST /api/admin/news/upload-url", () => {
  it("admin → 200 + { uploadUrl, key }; signs a news image PUT", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/news/upload-url")
      .send({ contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe("https://r2.example/put");
    expect(typeof res.body.key).toBe("string");
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      "news",
      admin,
      "image/png",
    );
  });

  it("rejects a disallowed content type → 400", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post("/api/admin/news/upload-url")
      .send({ contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it("non-admin → 403", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/admin/news/upload-url")
      .send({ contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  it("rate-limited → 429", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/admin/news/upload-url")
      .send({ contentType: "image/png" });
    expect(res.status).toBe(429);
  });
});

describe("news image on create / update", () => {
  const base = {
    title: "Z obrazem",
    summary: "Streszczenie z obrazkiem.",
    body: "Treść.",
    category: "world",
    source: "Blis-Q Redakcja",
  };

  it("create with a confirmed imageKey → signed imageUrl, key never serialised", async () => {
    const admin = await seedUser();
    const key = randomUUID();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/news")
      .send({ ...base, imageKey: key });
    expect(res.status).toBe(201);
    createdNewsIds.push(res.body.id);
    expect(confirmUploadMock).toHaveBeenCalledWith("news", key, admin);
    expect(res.body.imageUrl).toBe(`https://signed.example/${key}`);
    expect(res.body.imageKey).toBeUndefined();
  });

  it("create with an UNconfirmed imageKey → 400, no row written", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    confirmUploadMock.mockResolvedValueOnce(false);

    const before = await db.select().from(news);
    const res = await request(app)
      .post("/api/admin/news")
      .send({ ...base, imageKey: randomUUID() });
    expect(res.status).toBe(400);
    const after = await db.select().from(news);
    expect(after.length).toBe(before.length);
  });

  it("update sets a new confirmed imageKey", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    const key = randomUUID();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/news/${id}`)
      .send({ imageKey: key });
    expect(res.status).toBe(200);
    expect(confirmUploadMock).toHaveBeenCalledWith("news", key, admin);
    expect(res.body.imageUrl).toBe(`https://signed.example/${key}`);
  });

  it("update with imageKey:null removes the image", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/news/${id}`)
      .send({ imageKey: null });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeNull();
    expect(confirmUploadMock).not.toHaveBeenCalled();
  });

  it("no image → imageUrl null, getDownloadUrl not called", async () => {
    const admin = await seedUser();
    const id = await seedNews(admin);
    mockUser = { id: await seedUser(), isAdmin: false };

    const res = await request(app).get(`/api/v1/news/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBeNull();
    expect(getDownloadUrlMock).not.toHaveBeenCalled();
  });
});

describe("erasure", () => {
  it("nulls createdById on the news item (row survives, anonymised)", async () => {
    const author = await seedUser();
    const id = await seedNews(author, { title: "By author" });

    await storage.eraseUser(author);

    const [row] = await db.select().from(news).where(eq(news.id, id));
    expect(row).toBeDefined(); // content survives
    expect(row.createdById).toBeNull(); // de-linked from the erased author
  });
});
