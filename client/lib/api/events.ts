import type { CursorPage, EventDTO, RsvpStatus } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for the events feed + RSVP (docs/API.md §10). Screens go through
// these functions, never fetch directly: list the global upcoming feed (cursor-
// paginated), fetch one event, and upsert the caller's RSVP. The feed/detail
// expose `goingCount` (aggregate) only — there is no attendee-identity call.

export type EventsApiError =
  | { kind: "validation" } // 400
  | { kind: "forbidden" } // 403 — RSVP: not a member of the event's community
  | { kind: "notFound" } // 404 — event missing/deleted/not visible to caller
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type EventsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EventsApiError };

// 403/404 are events-specific (RSVP forbidden for non-members; event not
// visible); 400/429/5xx delegate to the shared mapper.
async function toEventsError(res: Response): Promise<EventsApiError> {
  if (res.status === 403) return { kind: "forbidden" };
  if (res.status === 404) return { kind: "notFound" };
  return commonApiError(res);
}

// GET /api/v1/events — global upcoming feed, soonest-first, cursor-paginated.
// Pass the previous page's nextCursor to fetch the next page; omit for page 1.
export function listEvents(
  cursor?: string,
): Promise<EventsResult<CursorPage<EventDTO>>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request(
    "GET",
    `/api/v1/events${query}`,
    undefined,
    (res) => res.json() as Promise<CursorPage<EventDTO>>,
    toEventsError,
  );
}

// GET /api/v1/events/:id — one event (incl. the caller's own rsvp + goingCount).
// 404 = missing / deleted / creator block-hidden.
export function getEvent(id: string): Promise<EventsResult<EventDTO>> {
  return request(
    "GET",
    `/api/v1/events/${id}`,
    undefined,
    (res) => res.json() as Promise<EventDTO>,
    toEventsError,
  );
}

// POST /api/v1/events/:id/rsvp — upsert the caller's RSVP. Community-member-gated
// server-side (403 for non-members). Returns the stored status only — never an
// attendee list. The screen patches goingCount locally from the status change.
export function setRsvp(
  id: string,
  status: RsvpStatus,
): Promise<EventsResult<{ status: RsvpStatus }>> {
  return request(
    "POST",
    `/api/v1/events/${id}/rsvp`,
    { status },
    (res) => res.json() as Promise<{ status: RsvpStatus }>,
    toEventsError,
  );
}
