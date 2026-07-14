import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listNews } from "@/lib/api/news";
import { strings } from "@/i18n";
import type { NewsDTO, NewsCategory } from "@shared/types";

// Data hook for the mobile News feed (P-31): OFFSET pagination (load-more appends
// the next page), a SERVER-SIDE category filter AND search (case-insensitive over
// title+summary+body), a silent refetch-on-focus (curated content changes between
// visits), and a monotonic stale-response guard (mirrors useResources): a response
// is applied only if its sequence id is still the latest. Read-only.

export type NewsStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more" | "silent";

export type UseNews = {
  items: NewsDTO[];
  status: NewsStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  category: NewsCategory | null; // active filter (null = all)
  search: string; // active search term ("" = all)
  setCategory: (category: NewsCategory | null) => void;
  setSearch: (search: string) => void;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
};

export function useNews(): UseNews {
  const [items, setItems] = useState<NewsDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<NewsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategoryState] = useState<NewsCategory | null>(null);
  const [search, setSearchState] = useState("");

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);
  // Filters are read from refs inside fetchPage so focus-refetch + load-more use
  // the CURRENT filter (setCategory/setSearch update them synchronously before
  // the reload they trigger).
  const categoryRef = useRef<NewsCategory | null>(null);
  const searchRef = useRef("");

  const fetchPage = useCallback(async (targetPage: number, mode: LoadMode) => {
    const seq = ++requestSeq.current;
    if (mode === "more") setLoadingMore(true);
    else if (mode === "refresh") setRefreshing(true);
    else if (mode === "replace") setStatus("loading");
    // "silent": no spinner — the existing list stays on screen.

    const result = await listNews({
      page: targetPage,
      category: categoryRef.current ?? undefined,
      search: searchRef.current || undefined,
    });

    if (mode === "more") setLoadingMore(false);
    else if (mode === "refresh") setRefreshing(false);

    if (seq !== requestSeq.current) return; // superseded → drop

    if (result.ok) {
      const pageData = result.data;
      setItems((prev) =>
        mode === "more" ? [...prev, ...pageData.data] : pageData.data,
      );
      setPage(pageData.page);
      setTotalPages(pageData.totalPages);
      setErrorMessage(null);
      setStatus("ready");
    } else if (mode === "replace" || mode === "refresh") {
      setErrorMessage(strings.news.loadError);
      setStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchPage(1, loadedOnce.current ? "silent" : "replace");
      loadedOnce.current = true;
    }, [fetchPage]),
  );

  const refresh = useCallback(() => fetchPage(1, "refresh"), [fetchPage]);
  const retry = useCallback(() => fetchPage(1, "replace"), [fetchPage]);

  // Switch the category filter (null = all). Ref FIRST so the reload uses it. A
  // no-op if unchanged; requestSeq drops any in-flight page from the old filter.
  const setCategory = useCallback(
    (next: NewsCategory | null) => {
      if (next === categoryRef.current) return;
      categoryRef.current = next;
      setCategoryState(next);
      void fetchPage(1, "replace");
    },
    [fetchPage],
  );

  // Apply the server-side search (called debounced as the user types). Trimmed; a
  // blank term clears it → full list. No-op if unchanged; requestSeq drops any
  // in-flight page from the previous term.
  const setSearch = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === searchRef.current) return;
      searchRef.current = trimmed;
      setSearchState(trimmed);
      void fetchPage(1, "replace");
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    if (loadingMore || refreshing || status !== "ready" || page >= totalPages) {
      return;
    }
    fetchPage(page + 1, "more");
  }, [fetchPage, loadingMore, refreshing, status, page, totalPages]);

  return {
    items,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    category,
    search,
    setCategory,
    setSearch,
    refresh,
    loadMore,
    retry,
  };
}
