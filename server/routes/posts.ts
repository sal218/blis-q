import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { PostRow } from "../storage";
import {
  postCreateBodySchema,
  postReportSchema,
  cursorPageQuerySchema,
} from "../validation";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { notifyCommunityMembers } from "../notifications";
import { encodeCursor, decodeCursor } from "../cursor";
import type { PostDTO, CursorPage } from "@shared/types";

// Community posts (docs/API.md §8). Every route is isAuthenticated. Reads are
// open to any authenticated user but require a non-deleted community and hide
// posts by users the caller has blocked; POST is member-gated. Posts are
// text-only this slice (R2 image upload deferred). Mutations are transactional +
// audited in storage; the new_community_post push is post-commit + best-effort.
export function registerPostRoutes(app: Express): void {
  app.get("/api/v1/communities/:id/posts", isAuthenticated, handleList);
  app.post("/api/v1/communities/:id/posts", isAuthenticated, handleCreate);
  app.get("/api/v1/posts/:id", isAuthenticated, handleGet);
  app.delete("/api/v1/posts/:id", isAuthenticated, handleDelete);
  app.post("/api/v1/posts/:id/report", isAuthenticated, handleReport);
}

// Deleted posts are returned as tombstones: content "[deleted]", author null.
function toPostDTO(row: PostRow): PostDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    communityId: row.communityId,
    author:
      deleted || !row.authorId
        ? null
        : {
            id: row.authorId,
            displayName: row.authorDisplayName ?? "",
            avatarUrl: row.authorAvatarUrl,
          },
    content: deleted ? "[deleted]" : row.content,
    imageUrl: deleted ? null : row.imageUrl,
    createdAt: row.createdAt.toISOString(),
    deleted,
  };
}

function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    // Reads require a non-deleted community.
    if (!(await storage.communityExists(id))) {
      return res.status(404).json({ error: "Not found" });
    }

    const q = cursorPageQuerySchema.parse(req.query); // lenient: ignores extras
    let cursor: { createdAt: Date; id: string } | undefined;
    if (q.cursor) {
      const decoded = decodeCursor(q.cursor);
      if (!decoded) return res.status(400).json({ error: "Invalid input" });
      cursor = decoded;
    }

    const { rows, nextCursor } = await storage.listPosts({
      communityId: id,
      callerId: req.user!.id,
      limit: q.limit,
      cursor,
    });

    const body: CursorPage<PostDTO> = {
      data: rows.map(toPostDTO),
      nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/communities/:id/posts]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleCreate(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkContentCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = postCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.createPost(
      id,
      userId,
      parsed.data.content,
      req.ip ?? null,
    );
    if (result.status === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result.status === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Post-commit, best-effort: a notification failure must never fail creation.
    Promise.resolve()
      .then(() =>
        notifyCommunityMembers(id, userId, "new_community_post", {
          communityId: id,
          postId: result.post.id,
        }),
      )
      .catch(() => {});

    return res.status(201).json(toPostDTO(result.post));
  } catch (err) {
    console.error("[POST /api/v1/communities/:id/posts]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const post = await storage.getPost(id, req.user!.id);
    if (!post) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toPostDTO(post));
  } catch (err) {
    console.error("[GET /api/v1/posts/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleDelete(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkContentCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await storage.softDeletePost(id, userId, req.ip ?? null);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/posts/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

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

    const parsed = postReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Only a visible (existing, non-deleted, not block-hidden) post is reportable.
    const post = await storage.getPost(id, userId);
    if (!post || post.deletedAt) {
      return res.status(404).json({ error: "Not found" });
    }

    await storage.submitReport(
      userId,
      { resourceType: "post", resourceId: id, reason: parsed.data.reason },
      req.ip ?? null,
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/posts/:id/report]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
