import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import { blockSchema, createReportSchema } from "../validation";
import { checkBlockRateLimit, checkReportRateLimit } from "../rateLimit";

// User-facing safety primitives (docs/API.md §12): blocking and report
// submission. Built early so content queries can filter from the start
// (TRANSFER §5.3). All routes isAuthenticated; the actor is always req.user.
//
// Block is ONE-directional per the contract (the caller no longer sees the
// blocked user in their own surfaces). There is NO mute — mute is deferred (it
// would need a schema change, which is DPIA-gated). Report submission is a thin
// insert into the moderation queue; moderation ACTIONS (resolve/ban/remove) are
// a separate admin path (Sprint 4), not here.
export function registerSafetyRoutes(app: Express): void {
  app.post("/api/v1/blocks", isAuthenticated, handleBlock);
  app.delete("/api/v1/blocks/:userId", isAuthenticated, handleUnblock);
  app.get("/api/v1/blocks", isAuthenticated, handleListBlocks);
  app.post("/api/v1/reports", isAuthenticated, handleReport);
}

async function handleBlock(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkBlockRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { blockedUserId } = parsed.data;

    if (blockedUserId === userId) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }

    const result = await storage.blockUser(
      userId,
      blockedUserId,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    // Idempotent: 201 on a fresh block, 200 if already blocked.
    return res.status(result === "created" ? 201 : 200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/blocks] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUnblock(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;
    const target = z.string().uuid().safeParse(req.params.userId);
    if (!target.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const rate = await checkBlockRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Idempotent — "removed" and "not_blocked" both succeed.
    await storage.unblockUser(userId, target.data, req.ip ?? null);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/blocks/:userId] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleListBlocks(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const blocked = await storage.listBlocks(req.user!.id);
    return res.status(200).json(blocked);
  } catch (err) {
    console.error("[GET /api/v1/blocks] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleReport(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkReportRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    await storage.submitReport(userId, parsed.data, req.ip ?? null);
    // Generic ack — never echo queue state or moderation internals.
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/reports] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
