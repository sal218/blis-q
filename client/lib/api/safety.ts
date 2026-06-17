import type { PublicUser } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for the block endpoints (docs/API.md §12). Screens go through
// here, never fetch directly. Block *initiation* is intentionally NOT exposed in
// this slice — the Profile UI only lists already-blocked users and unblocks them
// (block-from-profile is deferred; see the PR plan). Mute does not exist.
//
// GET /api/v1/blocks returns a plain PublicUser[] — it is NOT paginated, so this
// client does not invent page/cursor params (Codex refinement #3).

export type BlocksApiError =
  | { kind: "validation" } // 400
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type BlocksResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: BlocksApiError };

// All non-2xx codes for these endpoints are the shared ones (400/429/5xx); there
// is no block-specific status to special-case here.
const toBlocksError = commonApiError;

export function listBlocks(): Promise<BlocksResult<PublicUser[]>> {
  return request(
    "GET",
    "/api/v1/blocks",
    undefined,
    (res) => res.json() as Promise<PublicUser[]>,
    toBlocksError,
  );
}

export function unblockUser(
  userId: string,
): Promise<BlocksResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/blocks/${userId}`,
    undefined,
    async () => ({ ok: true }) as const,
    toBlocksError,
  );
}
