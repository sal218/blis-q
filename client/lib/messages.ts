import { strings, format } from "@/i18n";
import type { FieldError } from "@/validation/auth";
import type { CommunityFieldError } from "@/validation/communities";
import type { ApiError } from "@/lib/api/auth";
import type { CommunityApiError } from "@/lib/api/communities";
import type { BlocksApiError } from "@/lib/api/safety";
import type { PostsApiError } from "@/lib/api/posts";
import type { ChatApiError } from "@/lib/api/chat";
import type { EventsApiError } from "@/lib/api/events";

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

// Create-community field errors → Polish copy.
export function communityFieldErrorMessage(err: CommunityFieldError): string {
  switch (err.code) {
    case "nameRequired":
      return strings.communities.nameRequired;
    case "nameTooLong":
      return format(strings.communities.nameTooLong, { max: err.max });
    case "descriptionTooLong":
      return format(strings.communities.descriptionTooLong, { max: err.max });
  }
}

// Community API errors → copy. `conflict` (409) is context-dependent — join vs
// leave have different meanings — so the call site passes the right message
// rather than this function parsing the server's error string.
export function communityApiErrorMessage(
  error: CommunityApiError,
  conflictMessage: string,
): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "conflict":
      return conflictMessage;
    case "notFound":
      return strings.communities.notFound;
    case "forbidden":
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Posts feed + report API errors → copy. `notFound` (404) means the post/feed is
// no longer visible (deleted, or the community was removed) — the screen pairs
// this with a refresh.
export function postsApiErrorMessage(error: PostsApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "notFound":
      return strings.posts.notAvailable;
    case "forbidden":
      return strings.posts.forbidden;
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Community chat API errors → copy. `notFound` (404) means the message/community
// is no longer visible (deleted, or not a member); `forbidden` (403) is a
// non-member read or a delete the caller isn't allowed.
export function chatApiErrorMessage(error: ChatApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "notFound":
      return strings.chat.notAvailable;
    case "forbidden":
      return strings.chat.forbidden;
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Events feed/detail/RSVP API errors → copy. `notFound` (404) means the event is
// no longer visible (deleted, or creator block-hidden) — pair with a refresh;
// `forbidden` (403) on RSVP means the caller isn't a member of the community.
export function eventsApiErrorMessage(error: EventsApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "notFound":
      return strings.events.notAvailable;
    case "forbidden":
      return strings.events.rsvpForbidden;
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Block-list API errors → copy.
export function blocksApiErrorMessage(error: BlocksApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}
