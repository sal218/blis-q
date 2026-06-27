import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import type { EventRow } from "../storage";
import {
  createEventSchema,
  updateEventSchema,
  rsvpSchema,
  postReportSchema,
  cursorPageQuerySchema,
} from "../validation";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
} from "../rateLimit";
import { notifyCommunityMembers } from "../notifications";
import { encodeEventCursor, decodeEventCursor } from "../cursor";
import type { EventDTO, CursorPage, RsvpStatus } from "@shared/types";

// Events & RSVPs (docs/API.md §10). Every route is isAuthenticated. GET /events
// is a global UPCOMING discovery feed open to any authenticated user; it and the
// detail route expose only the aggregate goingCount — NEVER attendee identities
// (attending an Article 9 community's event is sensitive; a "who's going" view is
// deferred behind an explicit privacy decision). Create is community-member-gated;
// RSVP is community-member-gated; edit/delete are creator-or-mod/admin. Mutations
// are transactional + audited in storage; the new_event push is post-commit +
// best-effort. Event images are deferred (no imageKey accepted this slice).
export function registerEventRoutes(app: Express): void {
  app.get("/api/v1/events", isAuthenticated, handleList);
  app.post("/api/v1/communities/:id/events", isAuthenticated, handleCreate);
  app.get("/api/v1/events/:id", isAuthenticated, handleGet);
  app.patch("/api/v1/events/:id", isAuthenticated, handleUpdate);
  app.delete("/api/v1/events/:id", isAuthenticated, handleDelete);
  app.post("/api/v1/events/:id/rsvp", isAuthenticated, handleRsvp);
  app.post("/api/v1/events/:id/report", isAuthenticated, handleReport);
}

// Deleted events are tombstones: title "[deleted]", description/location/image
// stripped. goingCount is always the aggregate; rsvp is the caller's own status.
function toEventDTO(row: EventRow): EventDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    communityId: row.communityId,
    title: deleted ? "[deleted]" : row.title,
    description: deleted ? null : row.description,
    location: deleted ? null : row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    imageUrl: deleted ? null : row.imageUrl,
    createdAt: row.createdAt.toISOString(),
    goingCount: row.goingCount,
    rsvp: row.callerRsvpStatus
      ? { status: row.callerRsvpStatus as RsvpStatus }
      : null,
    deleted,
  };
}

function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const q = cursorPageQuerySchema.parse(req.query); // lenient: ignores extras
    let cursor: { startsAt: Date; id: string } | undefined;
    if (q.cursor) {
      const decoded = decodeEventCursor(q.cursor);
      if (!decoded) return res.status(400).json({ error: "Invalid input" });
      cursor = decoded;
    }

    const { rows, nextCursor } = await storage.listUpcomingEvents({
      callerId: req.user!.id,
      limit: q.limit,
      cursor,
    });

    const body: CursorPage<EventDTO> = {
      data: rows.map(toEventDTO),
      nextCursor: nextCursor ? encodeEventCursor(nextCursor) : null,
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/events]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleCreate(req: Request, res: Response): Promise<Response> {
  try {
    const communityId = parseId(req); // :id here is the community id
    if (!communityId) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkContentCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.createEvent(
      communityId,
      userId,
      parsed.data,
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
        notifyCommunityMembers(communityId, userId, "new_event", {
          communityId,
          eventId: result.event.id,
        }),
      )
      .catch(() => {});

    return res.status(201).json(toEventDTO(result.event));
  } catch (err) {
    console.error("[POST /api/v1/communities/:id/events]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGet(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const event = await storage.getEvent(id, req.user!.id);
    if (!event || event.deletedAt) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(toEventDTO(event));
  } catch (err) {
    console.error("[GET /api/v1/events/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUpdate(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.updateEvent(
      id,
      userId,
      parsed.data,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (result === "invalid_range") {
      return res.status(400).json({ error: "Invalid input" });
    }

    const event = await storage.getEvent(id, userId);
    if (!event) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(toEventDTO(event));
  } catch (err) {
    console.error("[PATCH /api/v1/events/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleDelete(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const result = await storage.softDeleteEvent(
      id,
      req.user!.id,
      req.ip ?? null,
    );
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/events/:id]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleRsvp(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const parsed = rsvpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    const result = await storage.setRsvp(id, req.user!.id, parsed.data.status);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    return res.status(200).json({ status: parsed.data.status });
  } catch (err) {
    console.error("[POST /api/v1/events/:id/rsvp]", {
      code: safeErrorCode(err),
    });
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

    const parsed = postReportSchema.safeParse(req.body); // { reason } — shared shape
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    // Only a visible (existing, non-deleted, community-live, not block-hidden)
    // event is reportable.
    const event = await storage.getEvent(id, userId);
    if (!event || event.deletedAt) {
      return res.status(404).json({ error: "Not found" });
    }

    await storage.submitReport(
      userId,
      { resourceType: "event", resourceId: id, reason: parsed.data.reason },
      req.ip ?? null,
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/events/:id/report]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
