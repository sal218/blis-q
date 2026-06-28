// Client-side validation for the create-event form. Mirrors the server Zod rules
// (server/validation.ts: createEventSchema) for fast inline UX only — the backend
// re-validates and remains the source of truth.
//
// Like communities, the server trims title/description/location, so we trim here
// AND submit trimmed values; a whitespace-only title is blocked in the UI and
// never reaches the API. Validators return a locale-independent code (or null);
// resolve to Polish copy with eventFieldErrorMessage() in @/lib/messages.

export const EVENT_TITLE_MAX = 150;
export const EVENT_TEXT_MAX = 1000;

export type EventFieldError =
  | { code: "titleRequired" }
  | { code: "titleTooLong"; max: number }
  | { code: "descriptionTooLong"; max: number }
  | { code: "locationTooLong"; max: number }
  | { code: "endBeforeStart" };

export function validateEventTitle(value: string): EventFieldError | null {
  const v = value.trim();
  if (v.length === 0) return { code: "titleRequired" };
  if (v.length > EVENT_TITLE_MAX) {
    return { code: "titleTooLong", max: EVENT_TITLE_MAX };
  }
  return null;
}

export function validateEventDescription(
  value: string,
): EventFieldError | null {
  if (value.trim().length > EVENT_TEXT_MAX) {
    return { code: "descriptionTooLong", max: EVENT_TEXT_MAX };
  }
  return null;
}

export function validateEventLocation(value: string): EventFieldError | null {
  if (value.trim().length > EVENT_TEXT_MAX) {
    return { code: "locationTooLong", max: EVENT_TEXT_MAX };
  }
  return null;
}

// endsAt (when present) must be strictly after startsAt — mirrors the server's
// `endsAt > startsAt` refine.
export function validateEventDates(
  startsAt: Date,
  endsAt: Date | null,
): EventFieldError | null {
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
    return { code: "endBeforeStart" };
  }
  return null;
}
