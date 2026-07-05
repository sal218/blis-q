import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { SafePlaceReadRow } from "../storage";
import { getDownloadUrl } from "../objectStorage";
import { checkRsvpRateLimit, checkReportRateLimit } from "../rateLimit";
import { safePlacesListQuerySchema, postReportSchema } from "../validation";
import {
  isAccessibilityFeature,
  type SafePlaceDTO,
  type SafePlaceCategory,
  type OffsetPage,
} from "@shared/types";

// Safe places — admin-curated LGBT-friendly venues (docs/API.md §11). Read-only
// for users; writes are admin-only (see routes/admin.ts). Both routes are
// isAuthenticated (auth class provisionally 🔑 pending the DPIA's location
// review). Venue coordinates are admin data, NOT user location (§5.8). The list
// accepts an ephemeral `near=lat,lng` used ONLY to sort nearest-first — it is
// never persisted or logged.

export function registerSafePlaceRoutes(app: Express): void {
  app.get("/api/v1/safe-places", isAuthenticated, handleList);
  // "/saved" must be registered BEFORE "/:id" so it isn't swallowed as an id.
  app.get("/api/v1/safe-places/saved", isAuthenticated, handleListSaved);
  app.get("/api/v1/safe-places/:id", isAuthenticated, handleGet);
  app.post("/api/v1/safe-places/:id/save", isAuthenticated, handleSave);
  app.delete("/api/v1/safe-places/:id/save", isAuthenticated, handleUnsave);
  app.post("/api/v1/safe-places/:id/report", isAuthenticated, handleReport);
}

const SAVED_SAFE_PLACES_LIMIT = 50;

// category is DB text; only validated categories are ever written, so the narrow
// to the SafePlaceCategory union is safe. `saved` is the caller's own private
// bookmark flag (no count / who-saved surface — Article 9). `imageUrl` is a
// short-lived SIGNED url — the raw R2 `imageKey` is never serialised. Async
// because signing the download url is per-object (a local crypto op, no network).
async function toSafePlaceDTO(row: SafePlaceReadRow): Promise<SafePlaceDTO> {
  return {
    id: row.id,
    name: row.name,
    category: row.category as SafePlaceCategory,
    description: row.description,
    address: row.address,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    imageUrl: row.imageKey
      ? await getDownloadUrl("safeplace", row.imageKey)
      : null,
    accessibilityFeatures: [...new Set(row.accessibilityFeatures ?? [])].filter(
      isAccessibilityFeature,
    ),
    saved: row.callerSaved,
  };
}

function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = safePlacesListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient on extras; bad category/near value → 400

    const { rows, total } = await storage.listSafePlaces({
      callerId: req.user!.id,
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      city: q.city,
      search: q.search,
      near: q.near, // ephemeral: order-by only, never stored/logged
    });

    const body: OffsetPage<SafePlaceDTO> = {
      data: await Promise.all(rows.map(toSafePlaceDTO)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/safe-places]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// GET /api/v1/safe-places/saved — the caller's saved (bookmarked) places,
// excluding soft-deleted, capped. Caller-scoped. Plain array (mirrors /events/saved).
async function handleListSaved(req: Request, res: Response): Promise<Response> {
  try {
    const rows = await storage.listSavedSafePlaces({
      callerId: req.user!.id,
      limit: SAVED_SAFE_PLACES_LIMIT,
    });
    const body: SafePlaceDTO[] = await Promise.all(rows.map(toSafePlaceDTO));
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/safe-places/saved]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid input" });

    const row = await storage.getSafePlace(id.data, req.user!.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(await toSafePlaceDTO(row));
  } catch (err) {
    console.error("[GET /api/v1/safe-places/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// POST /api/v1/safe-places/:id/save — bookmark a place. parseId → rate-limit →
// storage (mirrors events handleSave). Idempotent; NOT audited. 404 if missing/deleted.
async function handleSave(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const rate = await checkRsvpRateLimit(req.user!.id);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await storage.saveSafePlace(id, req.user!.id);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/safe-places/:id/save]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// DELETE /api/v1/safe-places/:id/save — remove the bookmark (idempotent → 200).
async function handleUnsave(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const rate = await checkRsvpRateLimit(req.user!.id);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    await storage.unsaveSafePlace(id, req.user!.id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/safe-places/:id/save]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// POST /api/v1/safe-places/:id/report — report a place into the moderation queue
// (mirrors the events/posts report routes). parseId → rate-limit → reason schema
// → an EXISTENCE/visibility check (only a real, non-deleted place is reportable,
// closing the generic /reports F-02 gap for this surface) → submitReport (which
// inserts the report + a report.submitted audit, IDs-only, in one transaction).
async function handleReport(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkReportRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = postReportSchema.safeParse(req.body); // { reason } — shared shape
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const place = await storage.getSafePlace(id, userId);
    if (!place) return res.status(404).json({ error: "Not found" });

    await storage.submitReport(
      userId,
      {
        resourceType: "safe_place",
        resourceId: id,
        reason: parsed.data.reason,
      },
      req.ip ?? null,
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/safe-places/:id/report]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
