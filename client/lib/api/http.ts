import { fetchWithAuth } from "@/lib/auth";

// Shared HTTP plumbing for every typed API client (auth, communities, safety).
// Each client builds on this: it supplies an `onOk` body reader and a `mapError`
// that turns a non-2xx Response into its OWN endpoint-specific error union. The
// pieces that are identical everywhere live here — the try/catch around fetch,
// the ok-check, retry-after parsing, and the status codes every endpoint shares
// (400 / 429 / 5xx).
//
// Privacy: this layer never logs request bodies, tokens, or response bodies. It
// reads only the one field it needs (retryAfter) and returns codes.

// Network failure (fetch threw: offline / DNS / TLS). Always possible, so it is
// folded into every ApiResult below rather than each client re-declaring it.
export type NetworkError = { kind: "network" };

// Discriminated result returned by every client call. `E` is the client's
// endpoint-specific error union; NetworkError is always added on top.
export type ApiResult<T, E> =
  | { ok: true; data: T }
  | { ok: false; error: E | NetworkError };

// The non-2xx codes every endpoint can return regardless of domain. Per-client
// mapError handlers delegate here for anything they don't special-case.
export type CommonApiError =
  | { kind: "validation" } // 400 — shouldn't happen if the client validated
  | { kind: "rateLimited"; retryAfter: number } // 429 (fail-closed limiter)
  | { kind: "server" }; // 5xx / unexpected status

async function readRetryAfter(res: Response): Promise<number> {
  try {
    const body = (await res.json()) as { retryAfter?: unknown };
    const ra = body?.retryAfter;
    return typeof ra === "number" && ra > 0 ? Math.ceil(ra) : 60;
  } catch {
    return 60;
  }
}

// Maps the shared status codes. 400 → validation, 429 → rateLimited (reads
// retryAfter), everything else → server.
export async function commonApiError(res: Response): Promise<CommonApiError> {
  switch (res.status) {
    case 400:
      return { kind: "validation" };
    case 429:
      return { kind: "rateLimited", retryAfter: await readRetryAfter(res) };
    default:
      return { kind: "server" };
  }
}

// ── Account-suspension detection (P-20) ─────────────────────────────────────────
// A 403 whose body carries { code: "account_suspended" } means the caller's
// account is banned. Rather than have every client map this, we surface it once,
// globally: the auth layer registers a handler that force-logs-out and shows the
// suspension screen. A monotonic "generation" makes this fire exactly once and
// ignores stale in-flight 403s from a superseded session — the generation is
// bumped on every session boundary (sign-in / sign-out / dismiss).
let suspensionGeneration = 0;
let suspendedHandler: (() => void | Promise<void>) | null = null;

// The auth layer registers (and on unmount clears) the force-logout handler.
export function registerSuspendedHandler(
  fn: (() => void | Promise<void>) | null,
): void {
  suspendedHandler = fn;
}

// Called by the auth layer on every session boundary so a 403 issued before the
// boundary cannot trigger suspension afterwards (e.g. a late response landing
// after the user deliberately signed out).
export function bumpSuspensionGeneration(): void {
  suspensionGeneration++;
}

// Peek the body for the suspension code WITHOUT consuming it (mapError still
// reads the original Response). res.clone() is absent on some test doubles —
// treat any failure to peek as "not suspended".
async function isSuspendedResponse(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return body?.code === "account_suspended";
  } catch {
    return false;
  }
}

// Fire the registered handler at most once per suspension event. `gen` is the
// generation captured when the request was issued: if a boundary has happened
// since (gen is stale) or a concurrent 403 already consumed this generation,
// do nothing. Consuming synchronously (before the await) makes concurrent
// same-generation 403s no-ops. The handler is exception-isolated so a
// force-logout failure never breaks request()'s `{ ok: false, error }` contract.
async function handleSuspension(gen: number): Promise<void> {
  if (gen !== suspensionGeneration) return;
  suspensionGeneration++;
  try {
    await Promise.resolve(suspendedHandler?.()).catch(() => {});
  } catch {
    // never propagate
  }
}

// ── Token refresh on 401 (P-10) ─────────────────────────────────────────────────
// When an authenticated request 401s (expired access token), try ONE refresh and
// retry the original request once. Refresh + expired-session handling are
// registered by the auth layer. A single in-flight promise makes concurrent 401s
// share one refresh attempt.
type RefreshOutcome = "ok" | "suspended" | "failed";
let refreshHandler: (() => Promise<RefreshOutcome>) | null = null;
let sessionExpiredHandler: (() => void | Promise<void>) | null = null;
let refreshInFlight: Promise<RefreshOutcome> | null = null;

export function registerRefreshHandler(
  fn: (() => Promise<RefreshOutcome>) | null,
): void {
  refreshHandler = fn;
}

export function registerSessionExpiredHandler(
  fn: (() => void | Promise<void>) | null,
): void {
  sessionExpiredHandler = fn;
}

// Single-flight: concurrent 401s share one refresh attempt.
function runRefresh(): Promise<RefreshOutcome> {
  if (!refreshHandler) return Promise.resolve("failed");
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(refreshHandler())
      .catch((): RefreshOutcome => "failed")
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// Fire the registered expired-session handler (force-logout → login + notice),
// exception-isolated so it never breaks request()'s error contract.
async function runSessionExpired(): Promise<void> {
  try {
    await Promise.resolve(sessionExpiredHandler?.()).catch(() => {});
  } catch {
    // never propagate
  }
}

// Auth endpoints (login/google/signup/forgot/reset/resend/refresh) — their 401
// means bad credentials, NOT an expired session, so they are excluded from the
// refresh-on-401 path.
function isAuthPath(path: string): boolean {
  return path.startsWith("/api/v1/auth/");
}

// Run a request: attach auth, read the success body via `onOk`, or map a non-2xx
// Response to the client's error via `mapError`. fetch throwing (network) always
// collapses to { kind: "network" }. No logging anywhere on this path.
export async function request<T, E>(
  method: string,
  path: string,
  body: unknown,
  onOk: (res: Response) => Promise<T>,
  mapError: (res: Response) => Promise<E>,
): Promise<ApiResult<T, E>> {
  const gen = suspensionGeneration; // capture at issue time
  let res: Response;
  try {
    res = await fetchWithAuth(method, path, body);
  } catch {
    return { ok: false, error: { kind: "network" } };
  }

  // 401 on an authenticated endpoint → try a single token refresh + one retry.
  if (res.status === 401 && !isAuthPath(path)) {
    const outcome = await runRefresh();
    if (outcome === "ok") {
      try {
        res = await fetchWithAuth(method, path, body); // retry ONCE
      } catch {
        return { ok: false, error: { kind: "network" } };
      }
    } else if (outcome === "suspended") {
      // The refresh itself returned 403 account_suspended → show suspension.
      await handleSuspension(gen);
    } else {
      // Refresh failed → the session is gone; route to login with a notice.
      await runSessionExpired();
    }
  }

  // Suspension check on the FINAL response (initial OR retried) — covers a retry
  // that itself returns 403 account_suspended (e.g. banned mid-session). The
  // generation guard makes handleSuspension fire at most once.
  if (!res.ok && res.status === 403 && (await isSuspendedResponse(res))) {
    await handleSuspension(gen);
  }

  if (res.ok) {
    return { ok: true, data: await onOk(res) };
  }
  return { ok: false, error: await mapError(res) };
}
