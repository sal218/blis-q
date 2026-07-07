import { strings, format } from "@/i18n";
import type { FieldError } from "@/validation/auth";
import type { CommunityFieldError } from "@/validation/communities";
import type { ApiError } from "@/lib/api/auth";
import type { CommunityApiError } from "@/lib/api/communities";
import type { BlocksApiError } from "@/lib/api/safety";
import type { PostsApiError } from "@/lib/api/posts";
import type { ChatApiError } from "@/lib/api/chat";
import type { EventsApiError } from "@/lib/api/events";
import type { EventFieldError } from "@/validation/events";
import type { CommonApiError, NetworkError } from "@/lib/api/http";

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
// Safe-places calls use the common error union only (no domain-specific codes);
// map it to shared copy for the detail screen's report outcome.
export function safePlacesApiErrorMessage(
  error: CommonApiError | NetworkError,
): string {
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

// Resources calls use the common error union only (no domain-specific codes);
// map it to shared copy for the detail screen's load/retry states.
export function resourcesApiErrorMessage(
  error: CommonApiError | NetworkError,
): string {
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
    case "conflict":
      return strings.events.rsvpUnavailable;
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Cancel-event API errors → copy. Distinct from the RSVP mapper: `forbidden`
// (403) here means the caller isn't the event's creator (not "join to RSVP"),
// and `conflict` (409) means the event is already cancelled or has passed.
export function cancelEventApiErrorMessage(error: EventsApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "forbidden":
      return strings.events.cancelForbidden;
    case "notFound":
      return strings.events.notAvailable;
    case "conflict":
      return strings.events.rsvpUnavailable; // "cancelled or already took place"
    case "validation":
    case "server":
      return strings.errors.generic;
  }
}

// Create-event form field errors → Polish copy.
export function eventFieldErrorMessage(err: EventFieldError): string {
  switch (err.code) {
    case "titleRequired":
      return strings.events.titleRequired;
    case "titleTooLong":
      return format(strings.events.titleTooLong, { max: err.max });
    case "descriptionTooLong":
      return format(strings.events.descriptionTooLong, { max: err.max });
    case "locationTooLong":
      return format(strings.events.locationTooLong, { max: err.max });
    case "endBeforeStart":
      return strings.events.endBeforeStart;
  }
}

// Create-event API errors → copy. `forbidden` (403) here means the caller isn't a
// MEMBER of the community (so can't create) — distinct from RSVP's forbidden copy;
// `notFound` (404) means the community is gone. Reusing eventsApiErrorMessage
// would show the RSVP wording, hence this create-specific mapper.
export function createEventApiErrorMessage(error: EventsApiError): string {
  switch (error.kind) {
    case "rateLimited":
      return format(strings.errors.rateLimited, { seconds: error.retryAfter });
    case "network":
      return strings.errors.network;
    case "forbidden":
      return strings.events.createForbidden;
    case "notFound":
      return strings.events.createCommunityGone;
    case "conflict": // create never returns 409; here for exhaustiveness
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
