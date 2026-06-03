import * as SecureStore from "expo-secure-store";

// Session token storage + authenticated fetch helper. The token is the Supabase
// session JWT; it lives in SecureStore (native keychain/keystore), never in
// AsyncStorage. server/auth.ts verifies it locally via JWKS.

const TOKEN_KEY = "blis-q.session-token";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * fetch() wrapper that attaches the bearer token. Returns the raw Response so
 * callers decide how to handle status codes. The frontend is a view layer —
 * it only ever talks to the Express API, never the database (CLAUDE.md §1).
 */
export async function fetchWithAuth(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
