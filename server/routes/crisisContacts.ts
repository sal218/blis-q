import type { Express, Request, Response } from "express";
import { z } from "zod";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { CrisisContactRow } from "../storage";
import { crisisContactsListQuerySchema } from "../validation";
import { checkCrisisReadRateLimit } from "../rateLimit";
import {
  type CrisisContactDTO,
  type CrisisContactCategory,
  type OffsetPage,
} from "@shared/types";

// Crisis / safety contacts — admin-curated "Pomoc w kryzysie" helplines (P-37,
// docs/API.md §11). Reads are PUBLIC (no auth): safety-critical, so crisis help
// works even when signed out. IP-rate-limited (fail-closed). Writes are admin-only
// (see routes/admin.ts). This is CONTENT, not user personal data. The `verified`
// flag is derived from the internal verifiedAt stamp — the raw timestamp never
// leaves the server.

export function registerCrisisContactRoutes(app: Express): void {
  app.get("/api/v1/crisis-contacts", handleList);
  app.get("/api/v1/crisis-contacts/:id", handleGet);
}

// category is DB text; only validated categories are ever written, so narrowing
// to the CrisisContactCategory union is safe.
function toCrisisContactDTO(row: CrisisContactRow): CrisisContactDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    description: row.description,
    hours: row.hours,
    category: row.category as CrisisContactCategory,
    verified: row.verifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const rate = await checkCrisisReadRateLimit(req);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const parsed = crisisContactsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data;

    const { rows, total } = await storage.listCrisisContacts({
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
    });

    const body: OffsetPage<CrisisContactDTO> = {
      data: rows.map(toCrisisContactDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/crisis-contacts]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const rate = await checkCrisisReadRateLimit(req);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid input" });

    const row = await storage.getCrisisContact(id.data);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toCrisisContactDTO(row));
  } catch (err) {
    console.error("[GET /api/v1/crisis-contacts/:id]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
