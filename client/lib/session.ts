import * as SecureStore from "expo-secure-store";
import type { AccountProfile, SessionResponse } from "@shared/types";

// Session persistence. EVERYTHING here lives in SecureStore (native keychain /
// keystore), never AsyncStorage — in Blis-Q even the profile/email is sensitive
// (an Article 9 signal), so it gets the same protection as the tokens.
//
// There is no GET /me endpoint yet (tracker P-1), so on launch we rehydrate the
// AccountProfile straight from here rather than re-fetching it. The refresh token
// IS exercised (tracker P-10): refreshSession() exchanges it — mid-session via the
// 401 interceptor (lib/api/http), and on cold start via loadSession() below.

export const ACCESS_TOKEN_KEY = "blis-q.session-token"; // also read by fetchWithAuth
export const REFRESH_TOKEN_KEY = "blis-q.refresh-token";
export const EXPIRES_KEY = "blis-q.session-expires";
export const PROFILE_KEY = "blis-q.profile";

export type StoredSession = {
  user: AccountProfile;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

// Persist a fresh session (from signup/login/google). Tokens + profile are
// written together so a rehydrate never sees a token without its profile.
export async function saveSession(session: SessionResponse): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.session.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.session.refreshToken),
    SecureStore.setItemAsync(EXPIRES_KEY, session.session.expiresAt),
    SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(session.user)),
  ]);
}

// Restore a persisted session on launch, or null if signed out.
//
// Cold-start refresh (tracker P-10): on a GENUINELY expired access token (a valid,
// PAST expiry) with a refresh token present, we exchange the refresh token via
// refreshSession() instead of signing out — so a returning user stays logged in
// across app restarts. A missing/unparseable expiry, a missing token, a corrupt
// profile, or a failed/suspended refresh is treated as signed out (fail safe);
// the store is cleared on the expired-but-unrefreshable path so it can't be
// retried. A banned user's cold-start refresh returns "suspended" → null here →
// they land on login and are re-gated to the suspension screen on re-login (P-20).
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const stored = await readStoredSession();
    if (!stored) return null; // partial/none/corrupt → signed out (nothing to clear)

    const expiryMs = Date.parse(stored.expiresAt);
    if (Number.isNaN(expiryMs)) {
      // Untrustworthy expiry → sign out.
      await clearSession();
      return null;
    }

    if (expiryMs <= Date.now()) {
      // Access token expired but the refresh token is still here → exchange it
      // (cold-start). refreshSession() persists the rotated session on success;
      // we re-read and return it.
      const outcome = await refreshSession();
      if (outcome === "ok") return await readStoredSession();
      // P-10a: a TRANSIENT failure (offline / 5xx) must not sign a valid user out
      // at launch — keep the stored session. The access token is expired, so the
      // first authenticated call 401s and the mid-session interceptor refreshes
      // once the network is back; until then the user simply isn't logged out.
      if (outcome === "offline") return stored;
      // A genuine rejection ("failed") or a ban ("suspended") signs out.
      await clearSession();
      return null;
    }

    return stored; // valid + not expired
  } catch {
    // Corrupt/unreadable store → treat as signed out rather than crash.
    return null;
  }
}

// Pure read of the four session keys into a StoredSession, or null if any token/
// the profile is missing or the profile is unparseable. Does NOT check expiry
// (callers decide) and never clears.
async function readStoredSession(): Promise<StoredSession | null> {
  const [accessToken, refreshToken, expiresAt, profileRaw] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_KEY),
    SecureStore.getItemAsync(PROFILE_KEY),
  ]);
  if (!accessToken || !refreshToken || !profileRaw) return null;
  try {
    const user = JSON.parse(profileRaw) as AccountProfile;
    return { user, accessToken, refreshToken, expiresAt: expiresAt ?? "" };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(EXPIRES_KEY),
    SecureStore.deleteItemAsync(PROFILE_KEY),
  ]);
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export type RefreshOutcome = "ok" | "suspended" | "failed" | "offline";

// Exchange the stored refresh token for a fresh session (tracker P-10). Uses a
// PLAIN fetch — NOT the typed request() layer — so it can never re-enter the
// 401→refresh interceptor that calls it. Returns:
//   "ok"        — refreshed + persisted; the caller can retry the original request
//   "suspended" — the account is banned (403 account_suspended) → suspension screen
//   "failed"    — a GENUINE rejection: no token / invalid-expired-revoked refresh
//                 token (401 / other 4xx) → the session is gone, sign out
//   "offline"   — a TRANSIENT failure we can't attribute to auth: a network throw
//                 (offline / DNS / TLS) or a 5xx server hiccup. The auth state is
//                 UNKNOWN, so the caller KEEPS the session (P-10a — a momentary
//                 connectivity blip during a refresh must NOT force a logout); the
//                 next successful refresh re-checks the ban/deleted gates.
// Never throws.
export async function refreshSession(): Promise<RefreshOutcome> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return "failed";

    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok) {
      const session = (await res.json()) as SessionResponse;
      await saveSession(session);
      return "ok";
    }
    if (res.status === 403) {
      try {
        const body = (await res.json()) as { code?: unknown };
        if (body?.code === "account_suspended") return "suspended";
      } catch {
        // unparseable body → fall through
      }
    }
    // A 5xx is a transient server error, not an auth rejection → keep the session.
    if (res.status >= 500) return "offline";
    // 401 / other 4xx / unparseable 403 → a genuine rejection.
    return "failed";
  } catch {
    // fetch threw → offline / DNS / TLS. Transient — keep the session.
    return "offline";
  }
}
