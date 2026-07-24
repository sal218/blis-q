import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for news suggestions ("Zaproponuj temat",
// P-31, docs/API.md §11/§14). isAuthenticated injects req.user; requireAdmin gates
// on the injected isAdmin. Storage runs against the test DB; supabase + rate
// limiters are mocked (no network). Mirrors news.integration.test.ts.
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
  checkNewsSuggestionRateLimit: jest.fn(),
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
import {
  checkAdminMutationRateLimit,
  checkNewsSuggestionRateLimit,
} from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, newsSuggestions, auditLog } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerNewsRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;
const suggestionRl = checkNewsSuggestionRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdSuggestionIds: string[] = [];

function uniqueEmail(): string {
  return `suggest+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedSuggestion(
  submitterId: string | null,
  over: {
    title?: string;
    description?: string | null;
    sourceUrl?: string | null;
    category?: string | null;
    status?: string;
    reviewedById?: string | null;
    declineReason?: string | null;
    reviewedAt?: Date | null;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(newsSuggestions)
    .values({
      submitterId,
      title: over.title ?? "Propozycja tematu",
      description: over.description ?? null,
      sourceUrl: over.sourceUrl ?? null,
      category: over.category ?? null,
      status: over.status ?? "pending",
      reviewedById: over.reviewedById ?? null,
      declineReason: over.declineReason ?? null,
      reviewedAt: over.reviewedAt ?? null,
    })
    .returning({ id: newsSuggestions.id });
  createdSuggestionIds.push(row.id);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
  suggestionRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdSuggestionIds.length) {
    await db
      .delete(auditLog)
      .where(inArray(auditLog.resourceId, createdSuggestionIds));
    await db
      .delete(newsSuggestions)
      .where(inArray(newsSuggestions.id, createdSuggestionIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(newsSuggestions)
      .where(inArray(newsSuggestions.submitterId, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdSuggestionIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

// Record the ids the API creates so cleanup catches them (create returns an ack).
async function mineIds(): Promise<string[]> {
  const res = await request(app).get("/api/v1/news/suggestions/mine");
  return (res.body.data as { id: string }[]).map((s) => s.id);
}

describe("POST /api/v1/news/suggestions", () => {
  it("401 without auth", async () => {
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ title: "Temat" });
    expect(res.status).toBe(401);
  });

  it("201 enqueues a suggestion (ack only) and it shows up in mine + audit", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app).post("/api/v1/news/suggestions").send({
      title: "Nowa inicjatywa",
      description: "Krótki opis.",
      category: "community",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });

    const ids = await mineIds();
    createdSuggestionIds.push(...ids);
    expect(ids.length).toBe(1);

    const audit = await db
      .select({ id: auditLog.id, metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "news_suggestion.submitted"),
          inArray(auditLog.resourceId, ids),
        ),
      );
    expect(audit.length).toBe(1);
  });

  it("400 when title is missing", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ description: "brak tytułu" });
    expect(res.status).toBe(400);
  });

  it("400 on an out-of-set category", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ title: "Temat", category: "orientation" });
    expect(res.status).toBe(400);
  });

  it("400 on a malformed sourceUrl", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ title: "Temat", sourceUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("400 on an unexpected extra field (strict)", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ title: "Temat", status: "approved" });
    expect(res.status).toBe(400);
  });

  it("429 when the per-user limiter is exhausted", async () => {
    suggestionRl.mockResolvedValue({ allowed: false, retryAfter: 42 });
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post("/api/v1/news/suggestions")
      .send({ title: "Temat" });
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBe(42);
  });
});

describe("GET /api/v1/news/suggestions/mine", () => {
  it("401 without auth", async () => {
    const res = await request(app).get("/api/v1/news/suggestions/mine");
    expect(res.status).toBe(401);
  });

  it("returns ONLY the caller's suggestions, newest-first", async () => {
    const me = await seedUser();
    const other = await seedUser();
    await seedSuggestion(me, { title: "Mój starszy" });
    await seedSuggestion(me, { title: "Mój nowszy" });
    await seedSuggestion(other, { title: "Cudzy" });

    mockUser = { id: me, isAdmin: false };
    const res = await request(app).get("/api/v1/news/suggestions/mine");
    expect(res.status).toBe(200);
    const titles = (res.body.data as { title: string }[]).map((s) => s.title);
    expect(titles).toEqual(["Mój nowszy", "Mój starszy"]);
    expect(titles).not.toContain("Cudzy");
    // DTO minimisation: no submitter/reviewer ids leak to the user surface.
    expect(res.body.data[0]).not.toHaveProperty("submitterId");
    expect(res.body.data[0]).not.toHaveProperty("reviewedById");
  });

  it("is empty for a user with no suggestions", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app).get("/api/v1/news/suggestions/mine");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.data).toEqual([]);
  });
});

describe("GET /api/admin/news/suggestions", () => {
  it("403 for a non-admin", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app).get("/api/admin/news/suggestions");
    expect(res.status).toBe(403);
  });

  it("returns the queue for an admin", async () => {
    const submitter = await seedUser();
    await seedSuggestion(submitter, { title: "W kolejce" });
    mockUser = { id: await seedUser(), isAdmin: true };

    const res = await request(app).get("/api/admin/news/suggestions");
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe("number");
    expect(
      (res.body.data as { title: string }[]).some(
        (s) => s.title === "W kolejce",
      ),
    ).toBe(true);
    // admin DTO exposes reviewedById but still NOT submitterId (minimisation).
    expect(res.body.data[0]).toHaveProperty("reviewedById");
    expect(res.body.data[0]).not.toHaveProperty("submitterId");
  });

  it("filters by status", async () => {
    const submitter = await seedUser();
    await seedSuggestion(submitter, {
      title: "Pending one",
      status: "pending",
    });
    await seedSuggestion(submitter, {
      title: "Approved one",
      status: "approved",
    });
    mockUser = { id: await seedUser(), isAdmin: true };

    const res = await request(app)
      .get("/api/admin/news/suggestions")
      .query({ status: "approved" });
    expect(res.status).toBe(200);
    const statuses = (res.body.data as { status: string }[]).map(
      (s) => s.status,
    );
    expect(statuses.every((s) => s === "approved")).toBe(true);
  });
});

describe("POST /api/admin/news/suggestions/:id/approve", () => {
  it("403 for a non-admin", async () => {
    const id = await seedSuggestion(await seedUser());
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app).post(
      `/api/admin/news/suggestions/${id}/approve`,
    );
    expect(res.status).toBe(403);
  });

  it("200 transitions pending → approved and audits (IDs only)", async () => {
    const id = await seedSuggestion(await seedUser());
    const adminId = await seedUser();
    mockUser = { id: adminId, isAdmin: true };

    const res = await request(app).post(
      `/api/admin/news/suggestions/${id}/approve`,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.reviewedById).toBe(adminId);
    expect(res.body.reviewedAt).not.toBeNull();

    const audit = await db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "news_suggestion.approved"),
          eq(auditLog.resourceId, id),
        ),
      );
    expect(audit.length).toBe(1);
    expect(audit[0].metadata).toBeNull();
  });

  it("409 when already actioned", async () => {
    const id = await seedSuggestion(await seedUser(), { status: "approved" });
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app).post(
      `/api/admin/news/suggestions/${id}/approve`,
    );
    expect(res.status).toBe(409);
  });

  it("404 for a missing suggestion", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app).post(
      `/api/admin/news/suggestions/${randomUUID()}/approve`,
    );
    expect(res.status).toBe(404);
  });

  it("400 for a non-UUID id", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app).post(
      "/api/admin/news/suggestions/not-a-uuid/approve",
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/news/suggestions/:id/decline", () => {
  it("403 for a non-admin", async () => {
    const id = await seedSuggestion(await seedUser());
    mockUser = { id: await seedUser(), isAdmin: false };
    const res = await request(app)
      .post(`/api/admin/news/suggestions/${id}/decline`)
      .send({ reason: "off_topic" });
    expect(res.status).toBe(403);
  });

  it("200 declines with a reason (stored on the row, NOT in audit)", async () => {
    const id = await seedSuggestion(await seedUser());
    mockUser = { id: await seedUser(), isAdmin: true };

    const res = await request(app)
      .post(`/api/admin/news/suggestions/${id}/decline`)
      .send({ reason: "duplicate" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("declined");
    expect(res.body.declineReason).toBe("duplicate");

    const audit = await db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "news_suggestion.declined"),
          eq(auditLog.resourceId, id),
        ),
      );
    expect(audit.length).toBe(1);
    // The coarse reason lives on the row, never in audit metadata (IDs-only).
    expect(audit[0].metadata).toBeNull();
  });

  it("400 on an out-of-set reason", async () => {
    const id = await seedSuggestion(await seedUser());
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post(`/api/admin/news/suggestions/${id}/decline`)
      .send({ reason: "because" });
    expect(res.status).toBe(400);
  });

  it("400 when the reason is missing", async () => {
    const id = await seedSuggestion(await seedUser());
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post(`/api/admin/news/suggestions/${id}/decline`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("409 when already actioned", async () => {
    const id = await seedSuggestion(await seedUser(), { status: "declined" });
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post(`/api/admin/news/suggestions/${id}/decline`)
      .send({ reason: "off_topic" });
    expect(res.status).toBe(409);
  });

  it("404 for a missing suggestion", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post(`/api/admin/news/suggestions/${randomUUID()}/decline`)
      .send({ reason: "off_topic" });
    expect(res.status).toBe(404);
  });
});

describe("erasure + export (GDPR)", () => {
  it("nulls submitterId on erasure so the tip is retained but drops from mine", async () => {
    const submitter = await seedUser();
    const id = await seedSuggestion(submitter, { title: "Do anonimizacji" });

    await storage.eraseUser(submitter);

    // Row survives, de-linked.
    const [row] = await db
      .select({ submitterId: newsSuggestions.submitterId })
      .from(newsSuggestions)
      .where(eq(newsSuggestions.id, id));
    expect(row.submitterId).toBeNull();

    // Drops out of the erased user's "mine" list.
    mockUser = { id: submitter, isAdmin: false };
    const res = await request(app).get("/api/v1/news/suggestions/mine");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("nulls reviewedById on the reviewer's erasure (de-links actioned rows)", async () => {
    const submitter = await seedUser();
    const reviewer = await seedUser();
    const id = await seedSuggestion(submitter, {
      status: "approved",
      reviewedById: reviewer,
      reviewedAt: new Date(),
    });

    await storage.eraseUser(reviewer);

    const [row] = await db
      .select({ reviewedById: newsSuggestions.reviewedById })
      .from(newsSuggestions)
      .where(eq(newsSuggestions.id, id));
    expect(row.reviewedById).toBeNull();
  });

  it("account export includes the user's own suggestions", async () => {
    const me = await seedUser();
    await seedSuggestion(me, { title: "W eksporcie" });

    const data = await storage.getAccountExport(me);
    expect(data.newsSuggestions.some((s) => s.title === "W eksporcie")).toBe(
      true,
    );
  });
});
