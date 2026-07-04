import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listSafePlaces } from "@/lib/api/safePlaces";
import { strings } from "@/i18n";
import type { SafePlaceDTO, SafePlaceCategory } from "@shared/types";

// Data hook for the mobile Safe Places list (SP-3): OFFSET pagination (load-more
// appends the next page), a server-side category filter + city search, a SILENT
// refetch-on-focus (curated data changes between visits), and a monotonic
// stale-response guard (mirrors useEvents): a response is applied only if its
// sequence id is still the latest, so a slow load-more resolving after a
// refresh/filter-change can't append a stale page. Read-only; no `near` here
// (proximity ordering ships with the map, SP-4).

export type SafePlacesStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more" | "silent";

export type UseSafePlaces = {
  items: SafePlaceDTO[];
  status: SafePlacesStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  category: SafePlaceCategory | null; // active filter (null = all)
  city: string; // active city filter ("" = all)
  setCategory: (category: SafePlaceCategory | null) => void;
  setCity: (city: string) => void;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
};

export function useSafePlaces(): UseSafePlaces {
  const [items, setItems] = useState<SafePlaceDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<SafePlacesStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategoryState] = useState<SafePlaceCategory | null>(null);
  const [city, setCityState] = useState("");

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);
  // Filters are read from refs inside fetchPage so focus-refetch + load-more use
  // the CURRENT filter (setCategory/setCity update them synchronously before the
  // reload they trigger).
  const categoryRef = useRef<SafePlaceCategory | null>(null);
  const cityRef = useRef("");

  const fetchPage = useCallback(async (targetPage: number, mode: LoadMode) => {
    const seq = ++requestSeq.current;
    if (mode === "more") setLoadingMore(true);
    else if (mode === "refresh") setRefreshing(true);
    else if (mode === "replace") setStatus("loading");
    // "silent": no spinner — the existing list stays on screen.

    const result = await listSafePlaces({
      page: targetPage,
      category: categoryRef.current ?? undefined,
      city: cityRef.current || undefined,
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
      setErrorMessage(strings.safePlaces.loadError);
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
  // no-op if unchanged. requestSeq drops any in-flight page from the old filter.
  const setCategory = useCallback(
    (next: SafePlaceCategory | null) => {
      if (next === categoryRef.current) return;
      categoryRef.current = next;
      setCategoryState(next);
      void fetchPage(1, "replace");
    },
    [fetchPage],
  );

  // Apply a city filter (called on search submit). Trimmed; reloads from page 1.
  const setCity = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === cityRef.current) return;
      cityRef.current = trimmed;
      setCityState(trimmed);
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
    city,
    setCategory,
    setCity,
    refresh,
    loadMore,
    retry,
  };
}
