import { useCallback, useEffect, useRef, useState } from "react";
import { listCommunities } from "@/lib/api/communities";
import type { CommunityDTO } from "@shared/types";

// The caller's JOINED communities, for the create-event community picker
// (Option 1). There is no server-side "my communities" endpoint yet, so this
// pages through the existing browse endpoint and keeps rows where the caller has
// a membership. Paginating to exhaustion (not just page 1) guarantees EVERY
// joined community is reachable — unlike the Home rail, which only filters page
// one. Bounded by MAX_PAGES as a runaway guard. A dedicated `?membership=mine`
// endpoint is the proper long-term fix (follow-up; ties to P-28).

const PAGE_SIZE = 20;
const MAX_PAGES = 25; // safety cap (≤ 500 communities scanned)

export type JoinedCommunitiesStatus = "loading" | "ready" | "error";

export type UseJoinedCommunities = {
  communities: CommunityDTO[];
  status: JoinedCommunitiesStatus;
  retry: () => void;
};

// `enabled` gates fetching: the picker sheet is mounted (hidden) at all times,
// so it must not page the whole community list until it's actually opened.
export function useJoinedCommunities(enabled = true): UseJoinedCommunities {
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [status, setStatus] = useState<JoinedCommunitiesStatus>("loading");
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mySeq = ++seq.current;
    setStatus("loading");
    const joined: CommunityDTO[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await listCommunities({ page, pageSize: PAGE_SIZE });
      if (mySeq !== seq.current) return; // superseded by a newer load
      if (!result.ok) {
        setStatus("error");
        return;
      }
      joined.push(...result.data.data.filter((c) => c.membership !== null));
      if (page >= result.data.totalPages) break;
    }

    if (mySeq !== seq.current) return;
    setCommunities(joined);
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (enabled) {
      load();
    } else {
      // Closing the sheet invalidates any in-flight paginated load so a late
      // result can't apply after `enabled` flips false (seq only advances inside
      // load(), so bump it here to supersede the running one).
      seq.current++;
    }
  }, [enabled, load]);

  return { communities, status, retry: load };
}
