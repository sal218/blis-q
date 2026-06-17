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
  let res: Response;
  try {
    res = await fetchWithAuth(method, path, body);
  } catch {
    return { ok: false, error: { kind: "network" } };
  }
  if (res.ok) {
    return { ok: true, data: await onOk(res) };
  }
  return { ok: false, error: await mapError(res) };
}
