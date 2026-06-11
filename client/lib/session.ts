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
const REFRESH_TOKEN_KEY = "blis-q.refresh-token";
const EXPIRES_KEY = "blis-q.session-expires";
const PROFILE_KEY = "blis-q.profile";

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

// Restore a persisted session on launch, or null if none/partial/corrupt.
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
