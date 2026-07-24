import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listCommunities } from "@/lib/api/communities";
import { isTransientRailError, railRetryDelay } from "@/hooks/homeRailRetry";
import type { CommunityDTO } from "@shared/types";

// Data for the Home "Your communities" rail: the caller's JOINED communities.
// There is no dedicated "my communities" endpoint, so we read the first page of
// the browse list and filter to membership !== null (acceptable for the rail; a
// user with >20 joined communities may miss some on page 1 — tracked). The screen
// owns no fetching (ENGINEERING_STANDARDS §1/§4).
//
// Loads on first focus, then SILENTLY refetches on every later focus (so joining
// a community and returning to Home updates the rail without a spinner). The
// INITIAL/explicit failure surfaces as "error" (the screen shows a retry) — a
// silent refetch keeps the current list. `retry` re-runs a non-silent load.
// Stale-response guard (mirrors useHomeEvents/useHomeNews): a response is applied
// only if its sequence id is still the latest.

export type HomeCommunitiesStatus = "loading" | "ready" | "error";

const PAGE_SIZE = 20;

export type UseHomeCommunities = {
  communities: CommunityDTO[];
  status: HomeCommunitiesStatus;
  retry: () => void;
};

export function useHomeCommunities(): UseHomeCommunities {
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [status, setStatus] = useState<HomeCommunitiesStatus>("loading");
  const loadedOnce = useRef(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    const seq = ++requestSeq.current;
    if (!silent) setStatus("loading");
    let result = await listCommunities({
      page: 1,
      pageSize: PAGE_SIZE,
      search: "",
    });
    if (seq !== requestSeq.current) return; // superseded by a newer load → drop

    // Cold-start resilience: a transient failure on the INITIAL/explicit load is
    // usually a race with app launch — auto-retry ONCE after a short delay before
    // showing the error (mirrors a manual navigate-away-and-back). See
    // hooks/homeRailRetry.ts. Silent refetches keep the list, so they don't retry.
    if (!silent && !result.ok && isTransientRailError(result.error)) {
      await railRetryDelay();
      if (seq !== requestSeq.current) return; // superseded during the wait → drop
      result = await listCommunities({
        page: 1,
        pageSize: PAGE_SIZE,
        search: "",
      });
      if (seq !== requestSeq.current) return;
    }

    if (result.ok) {
      setCommunities(result.data.data.filter((c) => c.membership !== null));
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

  return { communities, status, retry };
}
