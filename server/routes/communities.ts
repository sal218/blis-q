import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { CommunityRow } from "../storage";
import { createCommunitySchema, offsetPageQuerySchema } from "../validation";
import {
  checkCommunityCreateRateLimit,
  checkCommunityJoinRateLimit,
} from "../rateLimit";
import type { CommunityDTO, OffsetPage } from "@shared/types";

// Communities (docs/API.md §7). Sprint-3 slice 1: create, browse, get, join,
// leave. Every route is isAuthenticated. Community creation is user-driven — the
// creator becomes the community admin (atomically, in storage.createCommunity).
// PATCH/DELETE community, member listing, and role management are later slices.
export function registerCommunityRoutes(app: Express): void {
  app.post("/api/v1/communities", isAuthenticated, handleCreate);
  app.get("/api/v1/communities", isAuthenticated, handleList);
  app.get("/api/v1/communities/:id", isAuthenticated, handleGet);
  app.post("/api/v1/communities/:id/join", isAuthenticated, handleJoin);
  app.delete("/api/v1/communities/:id/leave", isAuthenticated, handleLeave);
}

function toCommunityDTO(row: CommunityRow): CommunityDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    memberCount: row.memberCount,
    createdAt: row.createdAt.toISOString(),
    membership: row.callerRole ? { role: row.callerRole } : null,
  };
}

// Path :id must be a UUID — reject early with 400 rather than hitting the DB.
function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleCreate(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkCommunityCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = createCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const community = await storage.createCommunity({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      creatorId: userId,
      ipAddress: req.ip ?? null,
    });
    return res.status(201).json(toCommunityDTO(community));
  } catch (err) {
    console.error("[POST /api/v1/communities] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const userId = req.user!.id;
    const parsed = offsetPageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient: ignores extras
    const search =
      typeof req.query.search === "string" && req.query.search.trim()
        ? req.query.search.trim().slice(0, 100)
        : undefined;

    const { rows, total } = await storage.listCommunities({
      offset: (q.page - 1) * q.pageSize,
      limit: q.pageSize,
      search,
      callerId: userId,
    });

    const body: OffsetPage<CommunityDTO> = {
      data: rows.map(toCommunityDTO),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/communities] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const community = await storage.getCommunity(id, req.user!.id);
    if (!community) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toCommunityDTO(community));
  } catch (err) {
    console.error("[GET /api/v1/communities/:id] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleJoin(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkCommunityJoinRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await storage.joinCommunity(id, userId, req.ip ?? null);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "already") {
      return res.status(409).json({ error: "Already a member" });
    }
    return res.status(200).json({ role: "member" });
  } catch (err) {
    console.error("[POST /api/v1/communities/:id/join] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleLeave(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    // Membership churn shares the join bucket (join AND leave keyed the same).
    const rate = await checkCommunityJoinRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await storage.leaveCommunity(id, userId, req.ip ?? null);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "last_admin") {
      // The sole admin can't orphan the community — hand off the role first.
      return res
        .status(409)
        .json({ error: "Community must have at least one admin" });
    }
    // "left" and "not_member" both succeed — leaving is idempotent.
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/communities/:id/leave] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
