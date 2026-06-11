import type { ConsentType } from "@shared/types";

// Client-side form validation. This mirrors the server Zod rules
// (server/validation.ts) for fast inline UX feedback ONLY — the backend remains
// the source of truth and re-validates everything. Validators return a
// locale-independent error CODE (or null); resolve to copy with
// fieldErrorMessage() in @/lib/messages. Keeping codes separate from strings
// makes this module pure, deterministic, and testable without touching i18n.

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 50;
export const EMAIL_MAX = 254;

// Pragmatic email shape check (not RFC-perfect — the server validates strictly).
// Catches the common typos before a network round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldError =
  | { code: "emailInvalid" }
  | { code: "passwordTooShort"; min: number }
  | { code: "displayNameRequired" };

export function validateEmail(value: string): FieldError | null {
  const v = value.trim();
  if (v.length === 0 || v.length > EMAIL_MAX || !EMAIL_RE.test(v)) {
    return { code: "emailInvalid" };
  }
  return null;
}

// For signup + reset: enforce the real strength floor. (Login uses
// isNonEmpty instead — we never hint the password policy on a login error.)
export function validateNewPassword(value: string): FieldError | null {
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return { code: "passwordTooShort", min: PASSWORD_MIN };
  }
  return null;
}

export function validateDisplayName(value: string): FieldError | null {
  if (value.trim().length === 0) return { code: "displayNameRequired" };
  return null;
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

// Consent gate: an account can only be created when `account_creation` is among
// the selected purposes (Article 9 explicit consent). Mirrors the server refine.
export function isConsentValid(selected: readonly ConsentType[]): boolean {
  return selected.includes("account_creation");
}
