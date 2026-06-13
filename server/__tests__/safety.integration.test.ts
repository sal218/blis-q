import express from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Auth-mocked, real-DB tests (same pattern as the other route suites). Minimal
// ../auth mock (no requireActual) to avoid the auth→storage→auth circular load.
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
  generateResetToken: () => "stub",
  hashResetToken: () => "stub",
}));

jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

jest.mock("../rateLimit", () => ({
  checkBlockRateLimit: jest.fn(),
  checkReportRateLimit: jest.fn(),
}));

import { registerSafetyRoutes } from "../routes/safety";
import { checkBlockRateLimit, checkReportRateLimit } from "../rateLimit";
import { storage } from "../storage";
import { db, pool } from "../db";
import { users, blocks, reports, auditLog } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

const app = express();
app.use(express.json());
registerSafetyRoutes(app);

jest.setTimeout(30000);

const blockRl = checkBlockRateLimit as unknown as jest.Mock;
const reportRl = checkReportRateLimit as unknown as jest.Mock;

const POLICY_VERSION = "2026-06-10";
const createdUserIds: string[] = [];

function uniqueEmail(): string {
  return `saf+${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = null;
  blockRl.mockResolvedValue({ allowed: true });
  reportRl.mockResolvedValue({ allowed: true });
});

afterEach(async () => {
  if (createdUserIds.length) {
    await db.delete(blocks).where(inArray(blocks.blockerId, createdUserIds));
    await db.delete(blocks).where(inArray(blocks.blockedId, createdUserIds));
    await db.delete(reports).where(inArray(reports.reporterId, createdUserIds));
    await db.delete(auditLog).where(inArray(auditLog.actorId, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  createdUserIds.length = 0;
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/v1/blocks", () => {
  it("unauthenticated → 401", async () => {
    mockUser = null;
    const res = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: randomUUID() });
    expect(res.status).toBe(401);
  });

  it("non-uuid blockedUserId → 400", async () => {
    const id = await seedUser();
    mockUser = { id };
    const res = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });

  it("self-block → 400", async () => {
    const id = await seedUser();
    mockUser = { id };
    const res = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: id });
    expect(res.status).toBe(400);
  });

  it("blocking a non-existent user → 404", async () => {
    const id = await seedUser();
    mockUser = { id };
    const res = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it("fresh block → 201; duplicate → 200 (idempotent); audits once", async () => {
    const blocker = await seedUser();
    const target = await seedUser();
    mockUser = { id: blocker };

    const first = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: target });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ ok: true });

    const dup = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: target });
    expect(dup.status).toBe(200);
    expect(dup.body).toEqual({ ok: true });

    // Exactly one block row and one user.blocked audit (duplicate is a no-op).
    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, blocker));
    expect(rows).toHaveLength(1);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, blocker));
    expect(audits.filter((a) => a.action === "user.blocked")).toHaveLength(1);
  });

  it("rate-limited → 429", async () => {
    const id = await seedUser();
    mockUser = { id };
    blockRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const res = await request(app)
      .post("/api/v1/blocks")
      .send({ blockedUserId: randomUUID() });
    expect(res.status).toBe(429);
  });
});

describe("GET /api/v1/blocks", () => {
  it("returns blocked users as PublicUser (no email)", async () => {
    const blocker = await seedUser();
    const target = await seedUser();
    mockUser = { id: blocker };
    await request(app).post("/api/v1/blocks").send({ blockedUserId: target });

    const res = await request(app).get("/api/v1/blocks");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(target);
    expect(res.body[0].displayName).toBe("Tester");
    expect(res.body[0].email).toBeUndefined();
  });
});

describe("DELETE /api/v1/blocks/:userId", () => {
  it("unblocks (200) and is idempotent; audits removal; bad uuid → 400", async () => {
    const blocker = await seedUser();
    const target = await seedUser();
    mockUser = { id: blocker };
    await request(app).post("/api/v1/blocks").send({ blockedUserId: target });

    const removed = await request(app).delete(`/api/v1/blocks/${target}`);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ ok: true });
    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.blockerId, blocker));
    expect(rows).toHaveLength(0);

    // Idempotent: unblocking again still 200.
    const again = await request(app).delete(`/api/v1/blocks/${target}`);
    expect(again.status).toBe(200);

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, blocker));
    expect(audits.some((a) => a.action === "user.unblocked")).toBe(true);

    const bad = await request(app).delete("/api/v1/blocks/not-a-uuid");
    expect(bad.status).toBe(400);
  });
});

describe("POST /api/v1/reports", () => {
  it("submits a report → 201; queues it; audit references the report, not the reason", async () => {
    const id = await seedUser();
    mockUser = { id };
    const reason = "Treść narusza zasady społeczności";

    const res = await request(app).post("/api/v1/reports").send({
      resourceType: "post",
      resourceId: randomUUID(),
      reason,
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });

    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.reporterId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");

    // Privacy: the audit row must not embed the free-text reason.
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.actorId, id));
    const submitted = audits.find((a) => a.action === "report.submitted");
    expect(submitted).toBeTruthy();
    expect(JSON.stringify(submitted?.metadata ?? null)).not.toContain(reason);
    expect(submitted?.resourceId).toBe(rows[0].id);
  });

  it.each([
    [
      "bad resourceType",
      { resourceType: "nope", resourceId: randomUUID(), reason: "x" },
    ],
    [
      "non-uuid resourceId",
      { resourceType: "post", resourceId: "nope", reason: "x" },
    ],
    [
      "empty reason",
      { resourceType: "post", resourceId: randomUUID(), reason: "" },
    ],
  ])("invalid input (%s) → 400", async (_label, body) => {
    const id = await seedUser();
    mockUser = { id };
    const res = await request(app).post("/api/v1/reports").send(body);
    expect(res.status).toBe(400);
  });

  it("unauthenticated → 401; rate-limited → 429", async () => {
    mockUser = null;
    const un = await request(app)
      .post("/api/v1/reports")
      .send({ resourceType: "post", resourceId: randomUUID(), reason: "x" });
    expect(un.status).toBe(401);

    const id = await seedUser();
    mockUser = { id };
    reportRl.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const limited = await request(app)
      .post("/api/v1/reports")
      .send({ resourceType: "post", resourceId: randomUUID(), reason: "x" });
    expect(limited.status).toBe(429);
  });
});
