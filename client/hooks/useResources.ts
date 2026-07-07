import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listResources } from "@/lib/api/resources";
import { strings } from "@/i18n";
import type { ResourceDTO, ResourceCategory } from "@shared/types";

// Data hook for the mobile Resources list (P-37): OFFSET pagination (load-more
// appends the next page), a SERVER-SIDE category filter, a CLIENT-SIDE search
// over the loaded pages (the list endpoint has no ?search= — P-28), a silent
// refetch-on-focus (curated content changes between visits), and a monotonic
// stale-response guard (mirrors useSafePlaces): a response is applied only if
// its sequence id is still the latest. Read-only — no save/report (the DTO has
// no `saved`).

export type ResourcesStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more" | "silent";

export type UseResources = {
  items: ResourceDTO[]; // the client-search-filtered view of the loaded pages
  status: ResourcesStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  category: ResourceCategory | null; // active filter (null = all)
  search: string; // active client-side search term ("" = all)
  setCategory: (category: ResourceCategory | null) => void;
  setSearch: (search: string) => void;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
};

export function useResources(
  initialCategory: ResourceCategory | null = null,
): UseResources {
  const [rawItems, setRawItems] = useState<ResourceDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<ResourcesStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategoryState] = useState<ResourceCategory | null>(
    initialCategory,
  );
  const [search, setSearchState] = useState("");

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);
  // The category is read from a ref inside fetchPage so focus-refetch + load-more
  // use the CURRENT filter (setCategory updates it synchronously before reload).
  const categoryRef = useRef<ResourceCategory | null>(initialCategory);

  const fetchPage = useCallback(async (targetPage: number, mode: LoadMode) => {
    const seq = ++requestSeq.current;
    if (mode === "more") setLoadingMore(true);
    else if (mode === "refresh") setRefreshing(true);
    else if (mode === "replace") setStatus("loading");
    // "silent": no spinner — the existing list stays on screen.

    const result = await listResources({
      page: targetPage,
      category: categoryRef.current ?? undefined,
    });

    if (mode === "more") setLoadingMore(false);
    else if (mode === "refresh") setRefreshing(false);

    if (seq !== requestSeq.current) return; // superseded → drop

    if (result.ok) {
      const pageData = result.data;
      setRawItems((prev) =>
        mode === "more" ? [...prev, ...pageData.data] : pageData.data,
      );
      setPage(pageData.page);
      setTotalPages(pageData.totalPages);
      setErrorMessage(null);
      setStatus("ready");
    } else if (mode === "replace" || mode === "refresh") {
      setErrorMessage(strings.resources.loadError);
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

  // Switch the (server-side) category filter (null = all). Ref FIRST so the
  // reload uses it. No-op if unchanged; requestSeq drops any in-flight old page.
  const setCategory = useCallback(
    (next: ResourceCategory | null) => {
      if (next === categoryRef.current) return;
      categoryRef.current = next;
      setCategoryState(next);
      void fetchPage(1, "replace");
    },
    [fetchPage],
  );

  // Client-side search over the loaded pages (title + body). The list endpoint
  // has no ?search=, so this only matches what's already fetched — a known
  // limitation (server-side search is P-28). Just updates state; no refetch.
  const setSearch = useCallback((next: string) => {
    setSearchState(next);
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || refreshing || status !== "ready" || page >= totalPages) {
      return;
    }
    fetchPage(page + 1, "more");
  }, [fetchPage, loadingMore, refreshing, status, page, totalPages]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawItems;
    return rawItems.filter(
      (r) =>
        r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q),
    );
  }, [rawItems, search]);

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
