import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB integration tests for crisis contacts (docs/API.md §11/§14,
// P-37 "Pomoc w kryzysie"). Reads are PUBLIC (no isAuthenticated) so they work
// signed-out; writes go through the admin CRUD (requireAdmin). Storage runs
// against the test DB; supabase + rate limiters are mocked (no network).
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
  checkCrisisReadRateLimit: jest.fn(),
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

import { registerCrisisContactRoutes } from "../routes/crisisContacts";
import { registerAdminRoutes } from "../routes/admin";
import {
  checkAdminMutationRateLimit,
  checkCrisisReadRateLimit,
} from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, crisisContacts, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerCrisisContactRoutes(app);
registerAdminRoutes(app);

jest.setTimeout(30000);

const mutationRl = checkAdminMutationRateLimit as unknown as jest.Mock;
const readRl = checkCrisisReadRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];
const createdCrisisIds: string[] = [];

function uniqueEmail(): string {
  return `crisis+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

async function seedCrisisContact(
  actorId: string,
  over: {
    name?: string;
    phone?: string;
    description?: string;
    hours?: string;
    category?: string;
    verified?: boolean;
  } = {},
): Promise<string> {
  const row = await storage.createCrisisContact(
    {
      name: over.name ?? "Telefon zaufania",
      phone: over.phone ?? "116 123",
      description: over.description ?? "Wsparcie w kryzysie emocjonalnym.",
      hours: over.hours,
      category: over.category ?? "emotional_crisis",
      // Default VERIFIED so the public (verified-only) read shows seeded
      // contacts; pass verified:false explicitly to exercise the gate.
      verified: over.verified ?? true,
    },
    actorId,
    null,
  );
  createdCrisisIds.push(row.id);
  return row.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  mutationRl.mockResolvedValue({ allowed: true });
  readRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  jest.clearAllMocks();
  if (createdCrisisIds.length) {
    await db
      .delete(crisisContacts)
      .where(inArray(crisisContacts.id, createdCrisisIds));
  }
  if (createdUserIds.length) {
    await db
      .delete(crisisContacts)
      .where(inArray(crisisContacts.createdById, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdCrisisIds.length = 0;
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/v1/crisis-contacts (public)", () => {
  it("returns 200 signed-out (no auth required)", async () => {
    const admin = await seedUser();
    await seedCrisisContact(admin, { name: "Numer alarmowy", phone: "112" });
    // mockUser stays null → signed out.
    const res = await request(app).get("/api/v1/crisis-contacts");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.total).toBe("number");
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("filters by category", async () => {
    const admin = await seedUser();
    await seedCrisisContact(admin, {
      name: "Legal line",
      category: "legal",
    });
    await seedCrisisContact(admin, {
      name: "Emo line",
      category: "emotional_crisis",
    });
    const res = await request(app)
      .get("/api/v1/crisis-contacts")
      .query({ category: "legal" });
    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names).toContain("Legal line");
    expect(names).not.toContain("Emo line");
  });

  it("orders emergency before community (category priority)", async () => {
    const admin = await seedUser();
    const community = await seedCrisisContact(admin, {
      name: "Community line",
      category: "community",
    });
    const emergency = await seedCrisisContact(admin, {
      name: "Emergency line",
      phone: "112",
      category: "emergency",
    });
    const res = await request(app).get("/api/v1/crisis-contacts");
    const ids = res.body.data.map((c: { id: string }) => c.id);
    expect(ids.indexOf(emergency)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(emergency)).toBeLessThan(ids.indexOf(community));
  });

  it("rejects an out-of-set category with 400", async () => {
    const res = await request(app)
      .get("/api/v1/crisis-contacts")
      .query({ category: "not_a_category" });
    expect(res.status).toBe(400);
  });

  it("excludes soft-deleted contacts", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin, { name: "To be deleted" });
    await storage.softDeleteCrisisContact(id, admin, null);
    const res = await request(app).get("/api/v1/crisis-contacts");
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: { id: string }) => c.id === id)).toBe(false);
  });

  it("excludes unverified contacts (the public read is verified-only)", async () => {
    const admin = await seedUser();
    const verified = await seedCrisisContact(admin, {
      name: "Zweryfikowany",
      category: "legal",
    });
    const unverified = await seedCrisisContact(admin, {
      name: "Niezweryfikowany",
      category: "legal",
      verified: false,
    });
    const res = await request(app).get("/api/v1/crisis-contacts");
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);
    expect(ids).toContain(verified);
    expect(ids).not.toContain(unverified);
  });

  it("IP rate-limited → 429", async () => {
    readRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app).get("/api/v1/crisis-contacts");
    expect(res.status).toBe(429);
  });
});

describe("GET /api/v1/crisis-contacts/:id (public)", () => {
  it("returns the DTO (hours null, verified boolean)", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin, {
      name: "Numer alarmowy",
      phone: "112",
      category: "emergency",
      verified: true,
      // hours omitted → null
    });
    const res = await request(app).get(`/api/v1/crisis-contacts/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.phone).toBe("112");
    expect(res.body.hours).toBeNull();
    expect(res.body.verified).toBe(true);
    // The raw verifiedAt timestamp must never be exposed.
    expect(res.body.verifiedAt).toBeUndefined();
  });

  it("404 for a missing / soft-deleted contact", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin);
    await storage.softDeleteCrisisContact(id, admin, null);
    expect(
      (await request(app).get(`/api/v1/crisis-contacts/${id}`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/crisis-contacts/${randomUUID()}`))
        .status,
    ).toBe(404);
  });

  it("404 for an unverified contact (the public read is verified-only)", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin, { verified: false });
    expect(
      (await request(app).get(`/api/v1/crisis-contacts/${id}`)).status,
    ).toBe(404);
  });

  it("400 on a bad uuid", async () => {
    expect(
      (await request(app).get("/api/v1/crisis-contacts/not-a-uuid")).status,
    ).toBe(400);
  });
});

describe("GET /api/admin/crisis-contacts", () => {
  it("includes unverified contacts (admin sees all)", async () => {
    const admin = await seedUser();
    const unverified = await seedCrisisContact(admin, {
      name: "Niezweryfikowany",
      verified: false,
    });
    // The public read hides it…
    const pub = await request(app).get("/api/v1/crisis-contacts");
    expect(pub.body.data.map((c: { id: string }) => c.id)).not.toContain(
      unverified,
    );
    // …but the admin list includes it (admins manage/verify unverified rows).
    mockUser = { id: admin, isAdmin: true };
    const res = await request(app).get("/api/admin/crisis-contacts");
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { id: string }) => c.id)).toContain(
      unverified,
    );
  });

  it("non-admin → 403", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect((await request(app).get("/api/admin/crisis-contacts")).status).toBe(
      403,
    );
  });
});

describe("POST /api/admin/crisis-contacts", () => {
  const body = {
    name: "  Telefon zaufania  ",
    phone: "116 123",
    description: "Wsparcie w kryzysie emocjonalnym dla dorosłych.",
    category: "emotional_crisis",
  };

  it("admin creates → 201 + trimmed DTO, hours null, unverified default, audited IDs-only", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .post("/api/admin/crisis-contacts")
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Telefon zaufania"); // trimmed
    expect(res.body.category).toBe("emotional_crisis");
    expect(res.body.hours).toBeNull(); // omitted
    expect(res.body.verified).toBe(false); // default
    createdCrisisIds.push(res.body.id);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, res.body.id));
    expect(audit.action).toBe("crisis_contact.created");
    expect(audit.resourceType).toBe("crisis_contact");
    expect(audit.actorId).toBe(admin);
    expect(audit.metadata).toBeNull();
  });

  it("verified:true stamps the DTO verified flag", async () => {
    const admin = await seedUser();
    mockUser = { id: admin, isAdmin: true };
    const res = await request(app)
      .post("/api/admin/crisis-contacts")
      .send({ ...body, verified: true });
    expect(res.status).toBe(201);
    expect(res.body.verified).toBe(true);
    createdCrisisIds.push(res.body.id);
  });

  it("non-admin → 403", async () => {
    mockUser = { id: await seedUser(), isAdmin: false };
    expect(
      (await request(app).post("/api/admin/crisis-contacts").send(body)).status,
    ).toBe(403);
  });

  it("bad input → 400 (out-of-set category)", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post("/api/admin/crisis-contacts")
      .send({ ...body, category: "nope" });
    expect(res.status).toBe(400);
  });

  it("bad input → 400 (non-phone text)", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .post("/api/admin/crisis-contacts")
      .send({ ...body, phone: "call me maybe" });
    expect(res.status).toBe(400);
  });

  it("rate-limited → 429", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    mutationRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/admin/crisis-contacts")
      .send(body);
    expect(res.status).toBe(429);
  });
});

describe("PATCH /api/admin/crisis-contacts/:id", () => {
  it("updates and audits crisis_contact.updated", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin, { name: "Old" });
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/crisis-contacts/${id}`)
      .send({ name: "New", verified: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
    expect(res.body.verified).toBe(true);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "crisis_contact.updated")).toBe(
      true,
    );
  });

  it("hours: null clears the hours", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin, { hours: "Całodobowo" });
    mockUser = { id: admin, isAdmin: true };

    const res = await request(app)
      .patch(`/api/admin/crisis-contacts/${id}`)
      .send({ hours: null });
    expect(res.status).toBe(200);
    expect(res.body.hours).toBeNull();
  });

  it("empty body → 400", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin);
    mockUser = { id: admin, isAdmin: true };
    expect(
      (await request(app).patch(`/api/admin/crisis-contacts/${id}`).send({}))
        .status,
    ).toBe(400);
  });

  it("404 for a missing contact", async () => {
    mockUser = { id: await seedUser(), isAdmin: true };
    const res = await request(app)
      .patch(`/api/admin/crisis-contacts/${randomUUID()}`)
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/crisis-contacts/:id", () => {
  it("soft-deletes → 200, then hidden + repeat 404; audits crisis_contact.deleted", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin);
    mockUser = { id: admin, isAdmin: true };

    const del = await request(app).delete(`/api/admin/crisis-contacts/${id}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });

    // No longer visible on the public read.
    expect(
      (await request(app).get(`/api/v1/crisis-contacts/${id}`)).status,
    ).toBe(404);

    // Idempotent: deleting again → 404.
    expect(
      (await request(app).delete(`/api/admin/crisis-contacts/${id}`)).status,
    ).toBe(404);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "crisis_contact.deleted")).toBe(
      true,
    );
  });

  it("non-admin → 403", async () => {
    const admin = await seedUser();
    const id = await seedCrisisContact(admin);
    mockUser = { id: await seedUser(), isAdmin: false };
    expect(
      (await request(app).delete(`/api/admin/crisis-contacts/${id}`)).status,
    ).toBe(403);
  });
});

describe("erasure", () => {
  it("nulls createdById on the contact (row survives, anonymised)", async () => {
    const author = await seedUser();
    const id = await seedCrisisContact(author, { name: "By author" });

    await storage.eraseUser(author);

    const [row] = await db
      .select()
      .from(crisisContacts)
      .where(eq(crisisContacts.id, id));
    expect(row).toBeDefined(); // row survives
    expect(row.createdById).toBeNull(); // de-linked
  });
});
