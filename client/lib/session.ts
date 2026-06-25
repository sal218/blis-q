import * as SecureStore from "expo-secure-store";
import type { AccountProfile, SessionResponse } from "@shared/types";

// Session persistence. EVERYTHING here lives in SecureStore (native keychain /
// keystore), never AsyncStorage — in Blis-Q even the profile/email is sensitive
// (an Article 9 signal), so it gets the same protection as the tokens.
//
// There is no GET /me endpoint yet (tracker P-1), so on launch we rehydrate the
// AccountProfile straight from here rather than re-fetching it. The refresh
// token is stored now but NOT yet exercised — token refresh is deferred
// (tracked before-beta); see docs/STATUS.md.

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

// Restore a persisted session on launch, or null if none/partial/corrupt/expired.
//
// Until token refresh exists (tracker P-10), an EXPIRED access token must be
// treated as signed out — otherwise a stale cached profile would route the user
// into the authenticated tree with a token the backend will reject. A missing or
// unparseable expiry is treated the same way (fail safe). Expired/invalid state
// is cleared so it can't be retried.
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const [accessToken, refreshToken, expiresAt, profileRaw] =
      await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(EXPIRES_KEY),
        SecureStore.getItemAsync(PROFILE_KEY),
      ]);
    if (!accessToken || !refreshToken || !profileRaw) return null;

    const expiryMs = Date.parse(expiresAt ?? "");
    if (Number.isNaN(expiryMs) || expiryMs <= Date.now()) {
      // Missing/invalid/past expiry → not usable until refresh exists. Clear it.
      await clearSession();
      return null;
    }

    const user = JSON.parse(profileRaw) as AccountProfile;
    return { user, accessToken, refreshToken, expiresAt: expiresAt ?? "" };
  } catch {
    // Corrupt/unreadable store → treat as signed out rather than crash.
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

export type RefreshOutcome = "ok" | "suspended" | "failed";

// Exchange the stored refresh token for a fresh session (tracker P-10). Uses a
// PLAIN fetch — NOT the typed request() layer — so it can never re-enter the
// 401→refresh interceptor that calls it. Returns:
//   "ok"        — refreshed + persisted; the caller can retry the original request
//   "suspended" — the account is banned (403 account_suspended) → suspension screen
//   "failed"    — no token / invalid-expired-revoked refresh token / network / other
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
        // unparseable body → fall through to "failed"
      }
    }
    return "failed";
  } catch {
    return "failed";
  }
}
