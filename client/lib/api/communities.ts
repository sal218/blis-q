import type { CommunityDTO, MembershipRole, OffsetPage } from "@shared/types";
import { request, commonApiError } from "@/lib/api/http";

// Typed client for /api/v1/communities (docs/API.md §7). Screens NEVER call fetch
// directly — they go through these functions, which resolve to a discriminated
// ApiResult so every failure mode is handled explicitly.
//
// Note on 409: both join ("already a member") and leave ("sole admin") return
// 409. We map both to a single `conflict` kind and let the CALL SITE choose the
// Polish copy (join screen vs leave action) — we never parse the server's error
// string to disambiguate (docs/API.md §7; Codex refinement).

export type CommunityApiError =
  | { kind: "validation" } // 400
  | { kind: "forbidden" } // 403
  | { kind: "notFound" } // 404 — missing/deleted community
  | { kind: "conflict" } // 409 — already a member (join) / sole admin (leave)
  | { kind: "rateLimited"; retryAfter: number } // 429
  | { kind: "server" } // 5xx / unexpected
  | { kind: "network" }; // fetch threw

export type CommunityResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CommunityApiError };

export type ListCommunitiesParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export type CreateCommunityInput = {
  name: string;
  description?: string;
};

// Map a non-2xx Response. 403/404/409 are community-specific; 400/429/5xx
// delegate to the shared mapper.
async function toCommunityError(res: Response): Promise<CommunityApiError> {
  switch (res.status) {
    case 403:
      return { kind: "forbidden" };
    case 404:
      return { kind: "notFound" };
    case 409:
      return { kind: "conflict" };
    default:
      return commonApiError(res);
  }
}

// Build a `?key=value` query string from defined, non-empty params. Values are
// URL-encoded; undefined/blank entries are omitted so the server applies its
// defaults. Returns "" (no query) when nothing is set.
function buildQuery(params: ListCommunitiesParams): string {
  const parts: string[] = [];
  if (params.page != null) parts.push(`page=${params.page}`);
  if (params.pageSize != null) parts.push(`pageSize=${params.pageSize}`);
  const search = params.search?.trim();
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

const communityBody = (res: Response): Promise<CommunityDTO> =>
  res.json() as Promise<CommunityDTO>;

// ── Endpoints ─────────────────────────────────────────────────────────────────

export function listCommunities(
  params: ListCommunitiesParams = {},
): Promise<CommunityResult<OffsetPage<CommunityDTO>>> {
  return request(
    "GET",
    `/api/v1/communities${buildQuery(params)}`,
    undefined,
    (res) => res.json() as Promise<OffsetPage<CommunityDTO>>,
    toCommunityError,
  );
}

export function getCommunity(
  id: string,
): Promise<CommunityResult<CommunityDTO>> {
  return request(
    "GET",
    `/api/v1/communities/${id}`,
    undefined,
    communityBody,
    toCommunityError,
  );
}

export function createCommunity(
  input: CreateCommunityInput,
): Promise<CommunityResult<CommunityDTO>> {
  return request(
    "POST",
    "/api/v1/communities",
    input,
    communityBody,
    toCommunityError,
  );
}

export function joinCommunity(
  id: string,
): Promise<CommunityResult<{ role: MembershipRole }>> {
  return request(
    "POST",
    `/api/v1/communities/${id}/join`,
    undefined,
    (res) => res.json() as Promise<{ role: MembershipRole }>,
    toCommunityError,
  );
}

export function leaveCommunity(
  id: string,
): Promise<CommunityResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/communities/${id}/leave`,
    undefined,
    async () => ({ ok: true }) as const,
    toCommunityError,
  );
}
