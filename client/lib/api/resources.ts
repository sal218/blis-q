import type { OffsetPage, ResourceDTO, ResourceCategory } from "@shared/types";
import {
  request,
  commonApiError,
  type ApiResult,
  type CommonApiError,
} from "@/lib/api/http";

// Typed client for the Resources read API (docs/API.md §11; P-37 Support &
// Education). Read-only for users: an offset-paged, admin-curated list of
// support/education content (featured-first). The screens go through these
// functions, never fetch directly. NO `search` param server-side — the list
// endpoint takes page + category only; the mobile search box filters the loaded
// items client-side (server-side search deferred, P-28).

export type ResourcesResult<T> = ApiResult<T, CommonApiError>;

// GET /api/v1/resources — offset page + optional category. Featured-first, then
// newest; soft-deleted excluded (server-side).
export function listResources(params: {
  page?: number;
  category?: ResourceCategory;
}): Promise<ResourcesResult<OffsetPage<ResourceDTO>>> {
  const parts: string[] = [];
  if (params.page) parts.push(`page=${params.page}`);
  if (params.category) {
    parts.push(`category=${encodeURIComponent(params.category)}`);
  }
  const query = parts.length ? `?${parts.join("&")}` : "";
  return request(
    "GET",
    `/api/v1/resources${query}`,
    undefined,
    (res) => res.json() as Promise<OffsetPage<ResourceDTO>>,
    commonApiError,
  );
}

// GET /api/v1/resources/:id — one resource. 404 = missing / soft-deleted.
export function getResource(id: string): Promise<ResourcesResult<ResourceDTO>> {
  return request(
    "GET",
    `/api/v1/resources/${id}`,
    undefined,
    (res) => res.json() as Promise<ResourceDTO>,
    commonApiError,
  );
}
