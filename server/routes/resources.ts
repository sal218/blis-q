import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { ResourceRow } from "../storage";
import { resourcesListQuerySchema } from "../validation";
import {
  type ResourceDTO,
  type ResourceCategory,
  type OffsetPage,
} from "@shared/types";

// Resources — admin-curated Support & Education content (P-37, docs/API.md §11).
// Read-only for users; writes are admin-only (see routes/admin.ts). Both routes
// are isAuthenticated. This is CONTENT, not user personal data. The mobile
// Resources screen + a "suggest a resource" moderation pipeline are later slices.

export function registerResourceRoutes(app: Express): void {
  app.get("/api/v1/resources", isAuthenticated, handleList);
  app.get("/api/v1/resources/:id", isAuthenticated, handleGet);
}

// category is DB text; only validated categories are ever written, so the narrow
// to the ResourceCategory union is safe.
function toResourceDTO(row: ResourceRow): ResourceDTO {
  return {
    id: row.id,
    title: row.title,
    category: row.category as ResourceCategory,
    body: row.body,
    url: row.url,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
  };
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = resourcesListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data;

    const { rows, total } = await storage.listResources({
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
    });

    const body: OffsetPage<ResourceDTO> = {
      data: rows.map(toResourceDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/resources]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid input" });

    const row = await storage.getResource(id.data);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toResourceDTO(row));
  } catch (err) {
    console.error("[GET /api/v1/resources/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
