import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listNews } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

// Data for the Home "Aktualności" rail: the latest news (first page,
// featured-first). Loads on first focus, then SILENTLY refetches on every later
// focus — so a freshly-published article shows without a spinner. A silent
// failure keeps the list. The screen owns no fetching (ENGINEERING_STANDARDS
// §1/§4) and slices to the first few. Stale-response guard (mirrors
// useHomeEvents): a response is applied only if its sequence id is still latest.

export type HomeNewsStatus = "loading" | "ready" | "error";

export type UseHomeNews = {
  news: NewsDTO[];
  status: HomeNewsStatus;
  retry: () => void;
};

export function useHomeNews(): UseHomeNews {
  const [news, setNews] = useState<NewsDTO[]>([]);
  const [status, setStatus] = useState<HomeNewsStatus>("loading");
  const loadedOnce = useRef(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    const seq = ++requestSeq.current;
    if (!silent) setStatus("loading");
    const result = await listNews({});
    if (seq !== requestSeq.current) return; // superseded by a newer load → drop
    if (result.ok) {
      setNews(result.data.data);
      setStatus("ready");
    } else if (!silent) {
      // Initial/explicit failure surfaces; a silent refetch keeps the list.
      setStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(loadedOnce.current);
      loadedOnce.current = true;
    }, [load]),
  );

  const retry = useCallback(() => {
    void load(false);
  }, [load]);

  return { news, status, retry };
}
