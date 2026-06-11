import type { ConsentType, SessionResponse } from "@shared/types";
import { fetchWithAuth } from "@/lib/auth";

// Typed client for the /api/v1/auth/* endpoints (docs/API.md §4). This is the
// ONLY thing screens use to talk to auth — they never call fetch directly. Every
// call resolves to a discriminated ApiResult so callers handle success and each
// failure mode explicitly (no thrown exceptions for expected HTTP errors).
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

async function readRetryAfter(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retryAfter?: unknown };
    const ra = body?.retryAfter;
    return typeof ra === "number" && ra > 0 ? Math.ceil(ra) : 60;
  } catch {
    return 60;
  }
}

// Map a non-2xx Response to an ApiError. Only retryAfter is read from the body.
async function toApiError(res: Response): Promise<ApiError> {
  switch (res.status) {
    case 400:
      return { kind: "validation" };
    case 401:
      return { kind: "invalidCredentials" };
    case 422:
      return { kind: "consentRequired" };
    case 429:
      return { kind: "rateLimited", retryAfter: await readRetryAfter(res) };
    default:
      return { kind: "server" };
  }
}

// Run a request and resolve success bodies via `onOk`. Network failures (fetch
// throwing) collapse to { kind: "network" }. No logging anywhere on this path.
async function request<T>(
  method: string,
  path: string,
  body: unknown,
  onOk: (res: Response) => Promise<T>,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchWithAuth(method, path, body);
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
  if (res.ok) {
    return { ok: true, data: await onOk(res) };
  }
  return { ok: false, error: await toApiError(res) };
}

const accepted = async (): Promise<Accepted> => ({ accepted: true });
const sessionBody = (res: Response): Promise<SessionResponse> =>
  res.json() as Promise<SessionResponse>;

// ── Endpoints ─────────────────────────────────────────────────────────────────

export function signUp(input: SignUpInput): Promise<ApiResult<Accepted>> {
  return request("POST", "/api/v1/auth/signup", input, accepted);
}

export function resendVerification(
  email: string,
): Promise<ApiResult<Accepted>> {
  return request(
    "POST",
    "/api/v1/auth/resend-verification",
    { email },
    accepted,
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
  );
}

export function forgotPassword(email: string): Promise<ApiResult<Accepted>> {
  return request("POST", "/api/v1/auth/forgot-password", { email }, accepted);
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
  );
}

export function googleSignIn(
  input: GoogleSignInInput,
): Promise<ApiResult<SessionResponse>> {
  return request("POST", "/api/v1/auth/google", input, sessionBody);
}
