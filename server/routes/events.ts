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
  eventsListQuerySchema,
} from "../validation";
import {
  checkContentCreateRateLimit,
  checkReportRateLimit,
  checkEventCancelRateLimit,
  checkRsvpRateLimit,
} from "../rateLimit";
import { notifyCommunityMembers } from "../notifications";
import { encodeEventCursor, decodeEventCursor } from "../cursor";
import type {
  EventDTO,
  CursorPage,
  RsvpStatus,
  EventCategory,
} from "@shared/types";

// Events & RSVPs (docs/API.md §10). Every route is isAuthenticated. GET /events
// is a global UPCOMING discovery feed open to any authenticated user; it and the
// detail route expose only the aggregate goingCount — NEVER attendee identities
// (attending an Article 9 community's event is sensitive; a "who's going" view is
// deferred behind an explicit privacy decision). Create is community-member-gated;
// RSVP is community-member-gated; edit/delete are creator-or-mod/admin. Mutations
// are transactional + audited in storage; the new_event push is post-commit +
// best-effort. Event images are deferred (no imageKey accepted this slice).
// The Home "upcoming events" rail is capped server-side (a short personal list).
const HOME_EVENTS_LIMIT = 10;
// The saved-events list is a full list (not a short home rail), so a higher cap.
const SAVED_EVENTS_LIMIT = 50;

export function registerEventRoutes(app: Express): void {
  app.get("/api/v1/events", isAuthenticated, handleList);
  // "/mine" + "/saved" must be registered BEFORE "/:id" so they aren't swallowed.
  app.get("/api/v1/events/mine", isAuthenticated, handleListMine);
  app.get("/api/v1/events/saved", isAuthenticated, handleListSaved);
  app.post("/api/v1/communities/:id/events", isAuthenticated, handleCreate);
  app.get("/api/v1/events/:id", isAuthenticated, handleGet);
  app.patch("/api/v1/events/:id", isAuthenticated, handleUpdate);
  app.delete("/api/v1/events/:id", isAuthenticated, handleDelete);
  app.post("/api/v1/events/:id/cancel", isAuthenticated, handleCancel);
  app.post("/api/v1/events/:id/rsvp", isAuthenticated, handleRsvp);
  app.post("/api/v1/events/:id/save", isAuthenticated, handleSave);
  app.delete("/api/v1/events/:id/save", isAuthenticated, handleUnsave);
  app.post("/api/v1/events/:id/report", isAuthenticated, handleReport);
}

// Deleted events are tombstones: title "[deleted]", description/location/image
// stripped. goingCount is always the aggregate; rsvp is the caller's own status.
// `past` (server-computed) + `canCancel` (creator-only capability) drive the
// cancel/past UI without ever serialising createdById.
function toEventDTO(row: EventRow, callerId: string): EventDTO {
  const deleted = row.deletedAt !== null;
  const cancelled = row.status === "cancelled";
  const past = row.startsAt.getTime() < Date.now();
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
    status: cancelled ? "cancelled" : "active",
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    past,
    canCancel: row.createdById === callerId && !cancelled && !past && !deleted,
    saved: row.callerSaved,
    // DB text; only validated categories are ever written, so the narrow is safe.
    // A deleted event's category is stripped alongside its other content.
    category: deleted ? null : (row.category as EventCategory | null),
  };
}

function parseId(req: Request): string | null {
  const parsed = z.string().uuid().safeParse(req.params.id);
  return parsed.success ? parsed.data : null;
}

async function handleList(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = eventsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const q = parsed.data; // lenient on extras; an invalid category value → 400
    let cursor: { startsAt: Date; id: string } | undefined;
    if (q.cursor) {
      const decoded = decodeEventCursor(q.cursor);
      if (!decoded) return res.status(400).json({ error: "Invalid input" });
      cursor = decoded;
    }

    const callerId = req.user!.id;
    const { rows, nextCursor } = await storage.listUpcomingEvents({
      callerId,
      limit: q.limit,
      cursor,
      category: q.category,
    });

    const body: CursorPage<EventDTO> = {
      data: rows.map((row) => toEventDTO(row, callerId)),
      nextCursor: nextCursor ? encodeEventCursor(nextCursor) : null,
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/events]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// GET /api/v1/events/mine — the caller's own upcoming "going" events (Home rail),
// soonest-first, capped. Caller-scoped; aggregate goingCount only.
async function handleListMine(req: Request, res: Response): Promise<Response> {
  try {
    const callerId = req.user!.id;
    const rows = await storage.listMyUpcomingEvents({
      callerId,
      limit: HOME_EVENTS_LIMIT,
    });
    const body: EventDTO[] = rows.map((row) => toEventDTO(row, callerId));
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/events/mine]", { code: safeErrorCode(err) });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// GET /api/v1/events/saved — the caller's saved (bookmarked) upcoming events,
// soonest-first, capped. Caller-scoped (a user only ever sees their own saves).
async function handleListSaved(req: Request, res: Response): Promise<Response> {
  try {
    const callerId = req.user!.id;
    const rows = await storage.listSavedEvents({
      callerId,
      limit: SAVED_EVENTS_LIMIT,
    });
    const body: EventDTO[] = rows.map((row) => toEventDTO(row, callerId));
    return res.status(200).json(body);
  } catch (err) {
    console.error("[GET /api/v1/events/saved]", { code: safeErrorCode(err) });
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

    return res.status(201).json(toEventDTO(result.event, userId));
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

    const callerId = req.user!.id;
    const event = await storage.getEvent(id, callerId);
    if (!event || event.deletedAt) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(toEventDTO(event, callerId));
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

    const rate = await checkContentCreateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

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
    return res.status(200).json(toEventDTO(event, userId));
  } catch (err) {
    console.error("[PATCH /api/v1/events/:id]", { code: safeErrorCode(err) });
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

    const result = await storage.softDeleteEvent(id, userId, req.ip ?? null);
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

// POST /api/v1/events/:id/cancel — the creator marks their event cancelled (the
// event stays visible with its content; only status/cancelledAt change). 403 for
// non-creators, 404 missing/deleted, 409 already cancelled.
async function handleCancel(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });
    const userId = req.user!.id;

    const rate = await checkEventCancelRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await storage.cancelEvent(id, userId, req.ip ?? null);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    if (result === "forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (result === "already_cancelled") {
      return res.status(409).json({ error: "Already cancelled" });
    }
    if (result === "past") {
      return res.status(409).json({ error: "Event already started" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/events/:id/cancel]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleRsvp(req: Request, res: Response): Promise<Response> {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Invalid input" });

    const rate = await checkRsvpRateLimit(req.user!.id);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

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
    if (result === "conflict") {
      // Event was cancelled or has already started — RSVP is closed.
      return res.status(409).json({ error: "Event not open for RSVP" });
    }
    return res.status(200).json({ status: parsed.data.status });
  } catch (err) {
    console.error("[POST /api/v1/events/:id/rsvp]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// POST /api/v1/events/:id/save — bookmark the event (idempotent). Visible-event
// only (404 for deleted/block-hidden). Private; not audited. Reuses the benign
// rsvp toggle limiter.
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

    const result = await storage.saveEvent(id, req.user!.id);
    if (result === "not_found") {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/events/:id/save]", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// DELETE /api/v1/events/:id/save — remove the bookmark (idempotent → always 200).
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

    await storage.unsaveEvent(id, req.user!.id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/events/:id/save]", {
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
