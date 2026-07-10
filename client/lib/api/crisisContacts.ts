import type {
  OffsetPage,
  CrisisContactDTO,
  CrisisContactCategory,
} from "@shared/types";
import {
  request,
  commonApiError,
  type ApiResult,
  type CommonApiError,
} from "@/lib/api/http";

// Crisis contacts ("Pomoc w kryzysie", P-37). A PUBLIC read — works signed-out
// (safety-critical), so no auth is required; request() attaches the token only if
// present. The list is short + curated, so the mobile screen fetches the whole
// set once (pageSize = the server max) and filters client-side, keeping the 112
// emergency banner available regardless of the active category chip.

export type CrisisContactsResult<T> = ApiResult<T, CommonApiError>;

export function listCrisisContacts(params: {
  page?: number;
  pageSize?: number;
  category?: CrisisContactCategory;
}): Promise<CrisisContactsResult<OffsetPage<CrisisContactDTO>>> {
  const parts: string[] = [];
  if (params.page) parts.push(`page=${params.page}`);
  if (params.pageSize) parts.push(`pageSize=${params.pageSize}`);
  if (params.category)
    parts.push(`category=${encodeURIComponent(params.category)}`);
  const query = parts.length ? `?${parts.join("&")}` : "";
  return request(
    "GET",
    `/api/v1/crisis-contacts${query}`,
    undefined,
    (res) => res.json() as Promise<OffsetPage<CrisisContactDTO>>,
    commonApiError,
  );
}
