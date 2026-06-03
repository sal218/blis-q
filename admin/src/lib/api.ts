// Admin API client. The dashboard is a view layer — it only talks to the
// Express API's admin routes (/api/admin/*), which are gated server-side by
// isAuthenticated + requireAdmin. The bearer token is a Supabase session JWT
// for a user whose users.isAdmin is true.

const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "blis-q-admin.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
