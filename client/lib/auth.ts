import * as SecureStore from "expo-secure-store";
import { ACCESS_TOKEN_KEY } from "@/lib/session";

// Authenticated fetch helper. The access token is the Supabase session JWT; it
// lives in SecureStore under the key owned by @/lib/session (the single source
// of truth for session storage). server/auth.ts verifies it locally via JWKS.
//
// Writing/clearing the session is done through @/lib/session (saveSession /
// clearSession) — this module only READS the access token to attach it.

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * fetch() wrapper that attaches the bearer token when present. Returns the raw
 * Response so callers decide how to handle status codes. The frontend is a view
 * layer — it only ever talks to the Express API, never the database (CLAUDE.md
 * §1). Never logs the token, the body, or the response.
 */
export async function fetchWithAuth(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = await getAccessToken();
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
