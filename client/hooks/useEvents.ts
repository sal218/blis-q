import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listEvents } from "@/lib/api/events";
import { eventsApiErrorMessage } from "@/lib/messages";
import type { EventDTO, EventCategory } from "@shared/types";

// Data hook for the global UPCOMING events feed: cursor pagination (load-more),
// pull-to-refresh, a stale-response guard, a SILENT refetch-on-focus (events
// change between visits, like the chat inbox), and a server-side CATEGORY filter
// (slice D2). The screen renders state and wires handlers; it owns no fetching
// logic. Read-only here (RSVP lives in useEvent).
//
// Stale-response guard (mirrors useCommunityPosts/useChats): every fetch bumps a
// monotonic sequence id; a response is applied only if its id is still the latest
// — so a slow load-more resolving AFTER a refresh (or a category switch) can't
// append a stale/duplicate page into the id-keyed FlatList.

export type EventsStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more" | "silent";

export type UseEvents = {
  events: EventDTO[];
  status: EventsStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  category: EventCategory | null; // active feed filter (null = all)
  setCategory: (category: EventCategory | null) => void;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
};

export function useEvents(): UseEvents {
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<EventsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [category, setCategoryState] = useState<EventCategory | null>(null);

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);
  // The active category is read from a ref inside fetchPage so focus-refetch and
  // load-more always use the CURRENT filter (setCategory updates it synchronously
  // before it triggers the reload — a re-render alone would lag the closure).
  const categoryRef = useRef<EventCategory | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | undefined, mode: LoadMode) => {
      const seq = ++requestSeq.current;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else if (mode === "replace") setStatus("loading");
      // "silent": no spinner — the existing list stays on screen.

      const result = await listEvents(cursor, categoryRef.current ?? undefined);

      if (mode === "more") setLoadingMore(false);
      else if (mode === "refresh") setRefreshing(false);

      // A newer request superseded this one — drop the result (the transient
      // flags above are reset regardless, so no spinner gets stuck).
      if (seq !== requestSeq.current) return;

      if (result.ok) {
        const page = result.data;
        setEvents((prev) =>
          mode === "more" ? [...prev, ...page.data] : page.data,
        );
        setNextCursor(page.nextCursor);
        setErrorMessage(null);
        setStatus("ready");
      } else if (mode === "replace" || mode === "refresh") {
        // Initial/refresh surface the error state; load-more and silent
        // refetch failures keep the existing list + status.
        setErrorMessage(eventsApiErrorMessage(result.error));
        setStatus("error");
      }
    },
    [],
  );

  // First focus → full load (spinner); every later focus → silent refresh.
  useFocusEffect(
    useCallback(() => {
      void fetchPage(undefined, loadedOnce.current ? "silent" : "replace");
      loadedOnce.current = true;
    }, [fetchPage]),
  );

  const refresh = useCallback(
    () => fetchPage(undefined, "refresh"),
    [fetchPage],
  );

  const retry = useCallback(() => fetchPage(undefined, "replace"), [fetchPage]);

  // Switch the server-side category filter (null = all). Sets the ref FIRST (so
  // the immediate reload — and any focus-refetch/load-more — uses the new value)
  // then reloads from scratch with a spinner. requestSeq drops any in-flight page
  // from the previous category. A no-op if the category is unchanged.
  const setCategory = useCallback(
    (next: EventCategory | null) => {
      if (next === categoryRef.current) return;
      categoryRef.current = next;
      setCategoryState(next);
      void fetchPage(undefined, "replace");
    },
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    // Block while a refresh/replace is active or there is no next page.
    if (
      loadingMore ||
      refreshing ||
      status !== "ready" ||
      nextCursor === null
    ) {
      return;
    }
    fetchPage(nextCursor, "more");
  }, [fetchPage, loadingMore, refreshing, status, nextCursor]);

  return {
    events,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    category,
    setCategory,
    refresh,
    loadMore,
    retry,
  };
}
