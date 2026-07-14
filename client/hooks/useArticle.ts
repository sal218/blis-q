import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getArticle } from "@/lib/api/news";
import type { NewsDTO } from "@shared/types";

// Data hook for a single news article's detail screen (P-31). Loads the article
// by id, silently refetches on focus (e.g. after an admin edit), and exposes a
// retry. Read-only. The screen is a view layer; opening the external "read at
// source" link is a screen concern (Linking).

export type ArticleStatus = "loading" | "ready" | "error";

export type UseArticle = {
  article: NewsDTO | null;
  status: ArticleStatus;
  retry: () => void;
};

export function useArticle(id: string): UseArticle {
  const [article, setArticle] = useState<NewsDTO | null>(null);
  const [status, setStatus] = useState<ArticleStatus>("loading");

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      const result = await getArticle(id);
      if (seq !== requestSeq.current) return; // superseded → drop
      if (result.ok) {
        setArticle(result.data);
        setStatus("ready");
      } else if (!silent) {
        setStatus("error");
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      void load(loadedOnce.current);
      loadedOnce.current = true;
    }, [load]),
  );

  const retry = useCallback(() => {
    void load(false);
  }, [load]);

  return { article, status, retry };
}
