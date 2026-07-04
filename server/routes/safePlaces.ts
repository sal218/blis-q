import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { SafePlaceRow } from "../storage";
import { safePlacesListQuerySchema } from "../validation";
import type {
  SafePlaceDTO,
  SafePlaceCategory,
  OffsetPage,
} from "@shared/types";

// Safe places — admin-curated LGBT-friendly venues (docs/API.md §11). Read-only
// for users; writes are admin-only (see routes/admin.ts). Both routes are
// isAuthenticated (auth class provisionally 🔑 pending the DPIA's location
// review). Venue coordinates are admin data, NOT user location (§5.8). The list
// accepts an ephemeral `near=lat,lng` used ONLY to sort nearest-first — it is
// never persisted or logged.

export function registerSafePlaceRoutes(app: Express): void {
  app.get("/api/v1/safe-places", isAuthenticated, handleList);
  app.get("/api/v1/safe-places/:id", isAuthenticated, handleGet);
}

// category is DB text; only validated categories are ever written, so the narrow
// to the SafePlaceCategory union is safe.
function toSafePlaceDTO(row: SafePlaceRow): SafePlaceDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.category as SafePlaceCategory,
    description: row.description,
    address: row.address,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
  };
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
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      city: q.city,
      near: q.near, // ephemeral: order-by only, never stored/logged
    });

    const body: OffsetPage<SafePlaceDTO> = {
      data: rows.map(toSafePlaceDTO),
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

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid input" });

    const row = await storage.getSafePlace(id.data);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toSafePlaceDTO(row));
  } catch (err) {
    console.error("[GET /api/v1/safe-places/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
