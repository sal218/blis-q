import { useCallback, useEffect, useRef, useState } from "react";
import { listCommunityPosts, reportPost } from "@/lib/api/posts";
import { postsApiErrorMessage } from "@/lib/messages";
import type { PostDTO } from "@shared/types";

// Data hook for a community's posts feed: cursor pagination (load-more),
// pull-to-refresh, a stale-response guard, and report. The screen renders the
// state and wires the handlers — it owns no fetching logic (ENGINEERING_STANDARDS
// §1/§4). Read-only this slice (no compose/delete).
//
// Stale-response guard (mirrors useCommunitiesList): every fetch bumps a
// monotonic sequence id; a response is applied only if its id is still the
// latest, so a slow load-more that resolves AFTER a refresh can't append stale
// or duplicate posts into the id-keyed FlatList.

export type CommunityPostsStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more";

export type ReportOutcome = { ok: true } | { ok: false; message: string };

export type UseCommunityPosts = {
  posts: PostDTO[];
  status: CommunityPostsStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
  report: (postId: string, reason: string) => Promise<ReportOutcome>;
};

export function useCommunityPosts(communityId: string): UseCommunityPosts {
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CommunityPostsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const requestSeq = useRef(0);

  const fetchPage = useCallback(
    async (cursor: string | undefined, mode: LoadMode) => {
      const seq = ++requestSeq.current;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setStatus("loading");

      const result = await listCommunityPosts(communityId, cursor);

      if (mode === "more") setLoadingMore(false);
      else if (mode === "refresh") setRefreshing(false);

      // A newer request superseded this one — drop the result. (The transient
      // flags above are reset regardless, so a stale load-more never leaves the
      // footer spinner stuck and never appends a stale/duplicate page.)
      if (seq !== requestSeq.current) return;

      if (result.ok) {
        const page = result.data;
        setPosts((prev) =>
          mode === "more" ? [...prev, ...page.data] : page.data,
        );
        setNextCursor(page.nextCursor);
        setErrorMessage(null);
        setStatus("ready");
      } else if (mode !== "more") {
        // Load-more failures keep the existing list; initial/refresh surface the
        // error state.
        setErrorMessage(postsApiErrorMessage(result.error));
        setStatus("error");
      }
    },
    [communityId],
  );

  useEffect(() => {
    fetchPage(undefined, "replace");
  }, [fetchPage]);

  const refresh = useCallback(
    () => fetchPage(undefined, "refresh"),
    [fetchPage],
  );

  const retry = useCallback(() => fetchPage(undefined, "replace"), [fetchPage]);

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

  const report = useCallback(
    async (postId: string, reason: string): Promise<ReportOutcome> => {
      const result = await reportPost(postId, reason);
      if (result.ok) return { ok: true };
      return { ok: false, message: postsApiErrorMessage(result.error) };
    },
    [],
  );

  return {
    posts,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    retry,
    report,
  };
}
