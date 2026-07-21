import { useCallback, useEffect, useRef, useState } from "react";
import { getRelatedNews } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

// Data hook for the article-detail "Więcej wiadomości" (More news) section
// (P-31). Loads a few related articles for the given id. Secondary, non-blocking
// content: on error it just yields an empty list + "error" status and the screen
// hides the section — no retry UI. Reloads when the id changes (tapping a related
// card pushes a new article screen with its own hook instance).

export type RelatedNewsStatus = "loading" | "ready" | "error";

export type UseRelatedNews = {
  items: NewsDTO[];
  status: RelatedNewsStatus;
};

export function useRelatedNews(id: string): UseRelatedNews {
  const [items, setItems] = useState<NewsDTO[]>([]);
  const [status, setStatus] = useState<RelatedNewsStatus>("loading");
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    const result = await getRelatedNews(id);
    if (seq !== requestSeq.current) return; // superseded → drop
    if (result.ok) {
      setItems(result.data);
      setStatus("ready");
    } else {
      setItems([]);
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, status };
}
