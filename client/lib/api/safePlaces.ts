import type {
  OffsetPage,
  SafePlaceDTO,
  SafePlaceCategory,
} from "@shared/types";
import {
  request,
  commonApiError,
  type ApiResult,
  type CommonApiError,
} from "@/lib/api/http";

// Typed client for the safe-places list (docs/API.md §11; epic P-40 slice SP-3).
// Read-only for users: an offset-paged, admin-curated list of LGBT-friendly
// venues. `near` (proximity ordering) is intentionally NOT sent here — it needs
// device location + consent and lands with the map (SP-4). The screen goes
// through this function, never fetches directly.

export type SafePlacesResult<T> = ApiResult<T, CommonApiError>;

// GET /api/v1/safe-places — offset page + optional category + free-text search.
// `search` is a case-insensitive substring over name + city + address (the
// mobile type-ahead box); blank is omitted (→ full list).
export function listSafePlaces(params: {
  page?: number;
  category?: SafePlaceCategory;
  search?: string;
}): Promise<SafePlacesResult<OffsetPage<SafePlaceDTO>>> {
  const parts: string[] = [];
  if (params.page) parts.push(`page=${params.page}`);
  if (params.category) {
    parts.push(`category=${encodeURIComponent(params.category)}`);
  }
  const search = params.search?.trim();
  if (search) parts.push(`search=${encodeURIComponent(search)}`);
  const query = parts.length ? `?${parts.join("&")}` : "";
  return request(
    "GET",
    `/api/v1/safe-places${query}`,
    undefined,
    (res) => res.json() as Promise<OffsetPage<SafePlaceDTO>>,
    commonApiError,
  );
}

// GET /api/v1/safe-places/saved — the caller's saved (bookmarked) places, capped.
export function listSavedSafePlaces(): Promise<
  SafePlacesResult<SafePlaceDTO[]>
> {
  return request(
    "GET",
    `/api/v1/safe-places/saved`,
    undefined,
    (res) => res.json() as Promise<SafePlaceDTO[]>,
    commonApiError,
  );
}

// POST /api/v1/safe-places/:id/save — bookmark a place (idempotent). 404 = not
// visible. Returns { ok: true }.
export function saveSafePlace(
  id: string,
): Promise<SafePlacesResult<{ ok: true }>> {
  return request(
    "POST",
    `/api/v1/safe-places/${id}/save`,
    undefined,
    async () => ({ ok: true }) as const,
    commonApiError,
  );
}

// DELETE /api/v1/safe-places/:id/save — remove the bookmark (idempotent → 200).
export function unsaveSafePlace(
  id: string,
): Promise<SafePlacesResult<{ ok: true }>> {
  return request(
    "DELETE",
    `/api/v1/safe-places/${id}/save`,
    undefined,
    async () => ({ ok: true }) as const,
    commonApiError,
  );
}
