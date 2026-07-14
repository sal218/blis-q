import type { OffsetPage, NewsDTO, NewsCategory } from "@shared/types";
import {
  request,
  commonApiError,
  type ApiResult,
  type CommonApiError,
} from "@/lib/api/http";

// Typed client for the News read API (docs/API.md §11; P-31 pillar-3 News).
// Read-only for users: an offset-paged, admin-curated list of LGBT+ news
// (featured-first). The screens go through these functions, never fetch directly.
// The list supports page + an optional category filter + an optional server-side
// `search` (case-insensitive substring over title + summary + body).

export type NewsResult<T> = ApiResult<T, CommonApiError>;

// GET /api/v1/news — offset page + optional category + optional search.
// Featured-first, then newest; soft-deleted excluded (server-side). `search` is a
// case-insensitive substring over title + summary + body (blank omitted → full
// list).
export function listNews(params: {
  page?: number;
  category?: NewsCategory;
  search?: string;
}): Promise<NewsResult<OffsetPage<NewsDTO>>> {
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
    `/api/v1/news${query}`,
    undefined,
    (res) => res.json() as Promise<OffsetPage<NewsDTO>>,
    commonApiError,
  );
}

// GET /api/v1/news/:id — one article. 404 = missing / soft-deleted.
export function getArticle(id: string): Promise<NewsResult<NewsDTO>> {
  return request(
    "GET",
    `/api/v1/news/${id}`,
    undefined,
    (res) => res.json() as Promise<NewsDTO>,
    commonApiError,
  );
}
