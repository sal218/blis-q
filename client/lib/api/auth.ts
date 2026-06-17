import type { ConsentType, SessionResponse } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for the /api/v1/auth/* endpoints (docs/API.md §4). This is the
// ONLY thing screens use to talk to auth — they never call fetch directly. Every
// call resolves to a discriminated ApiResult so callers handle success and each
// failure mode explicitly (no thrown exceptions for expected HTTP errors).
//
// Shared HTTP plumbing (request/network/retry-after/common status codes) lives
// in ./http; this module only declares the auth-specific error kinds + mapping.
//
// Privacy: this layer never logs request bodies, tokens, emails, or response
// bodies. It reads only the fields it needs (retryAfter) and returns codes.

export type ApiError =
  | { kind: "validation" } // 400 — shouldn't happen if the client validated
  | { kind: "invalidCredentials" } // 401
  | { kind: "consentRequired" } // 422 — first-time Google sign-up needs consent
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected status
  | { kind: "network" }; // fetch threw (offline / DNS / TLS)

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

// 202/200 with a plain { ok: true } acknowledgement (signup, resend, forgot,
// reset). The body carries no data we need — existence is never revealed.
export type Accepted = { accepted: true };

export type GoogleSignInInput = {
  idToken: string;
  accessToken?: string;
  nonce?: string;
  consentedTypes?: ConsentType[];
  policyVersion?: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
  consentedTypes: ConsentType[];
  policyVersion: string;
};

// Map a non-2xx Response to an auth ApiError. 401/422 are auth-specific; the
// rest (400/429/5xx) delegate to the shared mapper. Only retryAfter is read.
async function toApiError(res: Response): Promise<ApiError> {
  switch (res.status) {
    case 401:
      return { kind: "invalidCredentials" };
    case 422:
      return { kind: "consentRequired" };
    default:
      return commonApiError(res);
  }
}

const accepted = async (): Promise<Accepted> => ({ accepted: true });
const sessionBody = (res: Response): Promise<SessionResponse> =>
  res.json() as Promise<SessionResponse>;

// ── Endpoints ─────────────────────────────────────────────────────────────────

export function signUp(input: SignUpInput): Promise<ApiResult<Accepted>> {
  return request("POST", "/api/v1/auth/signup", input, accepted, toApiError);
}

export function resendVerification(
  email: string,
): Promise<ApiResult<Accepted>> {
  return request(
    "POST",
    "/api/v1/auth/resend-verification",
    { email },
    accepted,
    toApiError,
  );
}

export function login(
  email: string,
  password: string,
): Promise<ApiResult<SessionResponse>> {
  return request(
    "POST",
    "/api/v1/auth/login",
    { email, password },
    sessionBody,
    toApiError,
  );
}

export function forgotPassword(email: string): Promise<ApiResult<Accepted>> {
  return request(
    "POST",
    "/api/v1/auth/forgot-password",
    { email },
    accepted,
    toApiError,
  );
}

export function resetPassword(
  token: string,
  newPassword: string,
): Promise<ApiResult<Accepted>> {
  // The raw token reaches here from the deep link and goes straight into the
  // request body — it is never logged or stored (P-9).
  return request(
    "POST",
    "/api/v1/auth/reset-password",
    { token, newPassword },
    accepted,
    toApiError,
  );
}

export function googleSignIn(
  input: GoogleSignInInput,
): Promise<ApiResult<SessionResponse>> {
  return request("POST", "/api/v1/auth/google", input, sessionBody, toApiError);
}
