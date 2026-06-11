import { strings, format } from "@/i18n";
import type { FieldError } from "@/validation/auth";
import type { ApiError } from "@/lib/api/auth";

// The single place that turns locale-independent error codes (from validation +
// the API client) into user-facing Polish copy. Centralised so every screen
// shows consistent wording and the code→message maps stay exhaustive (the
// switches are checked by the compiler).

export function fieldErrorMessage(err: FieldError): string {
  switch (err.code) {
    case "emailInvalid":
      return strings.errors.emailInvalid;
    case "passwordTooShort":
      return format(strings.errors.passwordTooShort, { min: err.min });
    case "displayNameRequired":
      return strings.errors.displayNameRequired;
  }
}

// Maps an ApiError to copy. `consentRequired` is intentionally NOT a user-facing
// error — it's a control signal that the Google flow handles by showing the
// consent step — but we return safe copy as a fallback if it ever surfaces.
export function apiErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case "invalidCredentials":
      return strings.errors.invalidCredentials;
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "consentRequired":
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}
