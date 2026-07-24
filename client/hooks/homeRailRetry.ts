// Auto-retry policy for the Home rails' INITIAL (non-silent) load, shared by
// useHomeCommunities / useHomeEvents / useHomeNews.
//
// A cold app start can race the network: the API server/tunnel isn't reachable
// yet, or an expired-access-token refresh is still in flight (see
// lib/session.ts loadSession + the 401 interceptor in lib/api/http.ts). So the
// very first rail fetch can fail transiently even though the same call succeeds
// a moment later — which is exactly why navigating away and back "fixes" the
// rail. On a TRANSIENT failure we auto-retry ONCE after a short delay before
// surfacing the error card, so the rail self-heals without the user tapping
// "Spróbuj ponownie". Silent refetches skip this — a silent failure keeps the
// current list, so there is nothing to recover.

export const RAIL_RETRY_MS = 1500;

// Transient = a network throw (offline / DNS / TLS) or a 5xx/unexpected status —
// both retryable, and both mapped by the shared HTTP layer (lib/api/http.ts) to
// the "network" / "server" kinds every rail read can return. A 400 validation or
// a 429 rate-limit is NOT retried: retrying immediately wouldn't help.
export function isTransientRailError(error: { kind: string }): boolean {
  return error.kind === "network" || error.kind === "server";
}

export function railRetryDelay(ms: number = RAIL_RETRY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
