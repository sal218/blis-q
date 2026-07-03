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
  | { kind: "conflict" } // 409 — RSVP: event cancelled/past; cancel: already cancelled
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type EventsResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: EventsApiError };

// 403/404/409 are events-specific (RSVP forbidden for non-members; event not
// visible; RSVP closed / already cancelled); 400/429/5xx delegate to the shared
// mapper.
async function toEventsError(res: Response): Promise<EventsApiError> {
  if (res.status === 403) return { kind: "forbidden" };
  if (res.status === 404) return { kind: "notFound" };
  if (res.status === 409) return { kind: "conflict" };
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

// GET /api/v1/events/mine — the caller's own upcoming "going" events (the Home
// rail), soonest-first, capped. Returns a bare array (no pagination).
export function listMyEvents(): Promise<EventsResult<EventDTO[]>> {
  return request(
    "GET",
    `/api/v1/events/mine`,
    undefined,
    (res) => res.json() as Promise<EventDTO[]>,
    toEventsError,
  );
}

// GET /api/v1/events/saved — the caller's saved (bookmarked) upcoming events,
// soonest-first, capped. Caller-scoped; a bare array (no pagination).
export function listSavedEvents(): Promise<EventsResult<EventDTO[]>> {
  return request(
    "GET",
    `/api/v1/events/saved`,
    undefined,
    (res) => res.json() as Promise<EventDTO[]>,
    toEventsError,
  );
}

// POST /api/v1/events/:id/save — bookmark the event (idempotent). 404 = not
// visible. Returns { ok: true }.
export function saveEvent(id: string): Promise<EventsResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/events/${id}/save`,
    undefined,
    async () => ({ ok: true }) as const,
    toEventsError,
  );
}

// DELETE /api/v1/events/:id/save — remove the bookmark (idempotent → 200).
export function unsaveEvent(id: string): Promise<EventsResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/events/${id}/save`,
    undefined,
    async () => ({ ok: true }) as const,
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

// POST /api/v1/communities/:id/events — create an event (members only). Returns
// 201 with the created EventDTO. 403 = not a member of the community; 404 =
// community missing/deleted. Dates are ISO strings assembled by the form.
export function createEvent(
  communityId: string,
  input: {
    title: string;
    description?: string;
    location?: string;
    startsAt: string;
    endsAt?: string;
  },
): Promise<EventsResult<EventDTO>> {
  return request(
    "POST",
    `/api/v1/communities/${communityId}/events`,
    input,
    (res) => res.json() as Promise<EventDTO>,
    toEventsError,
  );
}

// POST /api/v1/events/:id/report — flag an event for moderation (visible-event
// only → 404 otherwise). Returns 201 on success (request() treats res.ok as ok).
// The reason is free text; the UI keeps it out of logs and minimises PII.
export function reportEvent(
  id: string,
  reason: string,
): Promise<EventsResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/events/${id}/report`,
    { reason },
    async () => ({ ok: true }) as const,
    toEventsError,
  );
}

// POST /api/v1/events/:id/cancel — the creator cancels their event. Creator-only
// server-side (403 otherwise); 404 missing/deleted; 409 if already cancelled.
// The event stays visible (its content is kept) with status "cancelled".
export function cancelEvent(id: string): Promise<EventsResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/events/${id}/cancel`,
    undefined,
    async () => ({ ok: true }) as const,
    toEventsError,
  );
}

// POST /api/v1/events/:id/rsvp — upsert the caller's RSVP. Community-member-gated
// server-side (403 for non-members; 409 if the event is cancelled/past). Returns
// the stored status only — never an attendee list. The screen patches goingCount
// locally from the status change.
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
