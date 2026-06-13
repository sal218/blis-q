import { useCallback, useEffect, useRef, useState } from "react";
import { listCommunities } from "@/lib/api/communities";
import { communityApiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import type { CommunityDTO } from "@shared/types";

// Data hook for the communities browse list: debounced search, offset
// pagination (load-more), pull-to-refresh, and a stale-response guard. The
// screen renders the returned state and wires the handlers — it owns no
// fetching logic (ENGINEERING_STANDARDS §1/§4).
//
// Stale-response guard: every fetch bumps a monotonic sequence id; a response is
// applied only if its id is still the latest, so a slow response for an old
// search can't overwrite a newer one.

export type CommunitiesListStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more";

const DEBOUNCE_MS = 350;
const PAGE_SIZE = 20;

export type UseCommunitiesList = {
  query: string;
  setQuery: (value: string) => void;
  debouncedQuery: string;
  communities: CommunityDTO[];
  status: CommunitiesListStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
};

export function useCommunitiesList(): UseCommunitiesList {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<CommunitiesListStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    async (targetPage: number, search: string, mode: LoadMode) => {
      const seq = ++requestSeq.current;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setStatus("loading");

      const result = await listCommunities({
        page: targetPage,
        pageSize: PAGE_SIZE,
        search,
      });

      if (mode === "more") setLoadingMore(false);
      else if (mode === "refresh") setRefreshing(false);

      // A newer request superseded this one — drop the result. (The transient
      // flags above are reset regardless, so a stale load-more never leaves the
      // footer spinner stuck on.)
      if (seq !== requestSeq.current) return;

      if (result.ok) {
        const pageData = result.data;
        setCommunities((prev) =>
          mode === "more" ? [...prev, ...pageData.data] : pageData.data,
        );
        setPage(pageData.page);
        setTotalPages(pageData.totalPages);
        setErrorMessage(null);
        setStatus("ready");
      } else if (mode !== "more") {
        // Load-more failures keep the existing list; initial/refresh/search
        // surface the error state.
        setErrorMessage(
          communityApiErrorMessage(result.error, strings.errors.generic),
        );
        setStatus("error");
      }
    },
    [],
  );

  // Debounce the raw query.
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(query.trim()),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  // (Re)load page 1 whenever the debounced search changes — also the initial load.
  useEffect(() => {
    fetchPage(1, debouncedQuery, "replace");
  }, [debouncedQuery, fetchPage]);

  const refresh = useCallback(
    () => fetchPage(1, debouncedQuery, "refresh"),
    [fetchPage, debouncedQuery],
  );

  const retry = useCallback(
    () => fetchPage(1, debouncedQuery, "replace"),
    [fetchPage, debouncedQuery],
  );

  const loadMore = useCallback(() => {
    if (loadingMore || status !== "ready" || page >= totalPages) return;
    fetchPage(page + 1, debouncedQuery, "more");
  }, [fetchPage, debouncedQuery, loadingMore, status, page, totalPages]);

  return {
    query,
    setQuery,
    debouncedQuery,
    communities,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    retry,
  };
}
