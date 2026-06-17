// Client-side validation for the create-community form. Mirrors the server Zod
// rules (server/validation.ts: createCommunitySchema) for fast inline UX only —
// the backend re-validates and remains the source of truth.
//
// IMPORTANT: the server schema does NOT trim, so a whitespace-only name would
// pass `.min(1)` on the server. We trim here AND submit the trimmed values, so
// "   " is blocked in the UI and never reaches the API (Codex refinement #1).
// Validators return a locale-independent code (or null); resolve to Polish copy
// with communityFieldErrorMessage() in @/lib/messages.

export const COMMUNITY_NAME_MAX = 100;
export const COMMUNITY_DESCRIPTION_MAX = 1000;

export type CommunityFieldError =
  | { code: "nameRequired" }
  | { code: "nameTooLong"; max: number }
  | { code: "descriptionTooLong"; max: number };

export function validateCommunityName(
  value: string,
): CommunityFieldError | null {
  const v = value.trim();
  if (v.length === 0) return { code: "nameRequired" };
  if (v.length > COMMUNITY_NAME_MAX) {
    return { code: "nameTooLong", max: COMMUNITY_NAME_MAX };
  }
  return null;
}

export function validateCommunityDescription(
  value: string,
): CommunityFieldError | null {
  if (value.trim().length > COMMUNITY_DESCRIPTION_MAX) {
    return { code: "descriptionTooLong", max: COMMUNITY_DESCRIPTION_MAX };
  }
  return null;
}
