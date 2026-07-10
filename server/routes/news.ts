import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { NewsRow } from "../storage";
import { newsListQuerySchema } from "../validation";
import {
  type NewsDTO,
  type NewsCategory,
  type OffsetPage,
} from "@shared/types";

// News — admin-curated pillar-3 News content (P-31, docs/API.md §11). Read-only
// for users; writes are admin-only (see routes/admin.ts). Both routes are
// isAuthenticated. This is CONTENT, not user personal data. The mobile News feed +
// article-detail screens (assets/news-feed-*.png, news-details-*.png) and a
// "Zaproponuj temat" (suggest-a-story) moderated submission pipeline are later
// slices.

export function registerNewsRoutes(app: Express): void {
  app.get("/api/v1/news", isAuthenticated, handleList);
  app.get("/api/v1/news/:id", isAuthenticated, handleGet);
}

// category is DB text; only validated categories are ever written, so the narrow
// to the NewsCategory union is safe. imageUrl is null until the admin image-upload
// + signed-URL slice (the raw imageKey is never projected/serialised).
function toNewsDTO(row: NewsRow): NewsDTO {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category as NewsCategory,
    source: row.source,
    sourceUrl: row.sourceUrl,
    imageUrl: null,
    featured: row.featured,
    createdAt: row.createdAt.toISOString(),
  };
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = newsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data;

    const { rows, total } = await storage.listNews({
      page: q.page,
      pageSize: q.pageSize,
      category: q.category,
      search: q.search,
    });

    const body: OffsetPage<NewsDTO> = {
      data: rows.map(toNewsDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/news]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ error: "Invalid input" });

    const row = await storage.getNews(id.data);
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toNewsDTO(row));
  } catch (err) {
    console.error("[GET /api/v1/news/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
