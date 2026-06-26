import { useEffect, useState } from "react";
import { listCommunities } from "@/lib/api/communities";
import type { CommunityDTO } from "@shared/types";

// Data for the Home "Your communities" rail: the caller's JOINED communities.
// There is no dedicated "my communities" endpoint, so we read the first page of
// the browse list and filter to membership !== null (acceptable for the rail; a
// user with >20 joined communities may miss some on page 1 — tracked). The screen
// owns no fetching (ENGINEERING_STANDARDS §1/§4).

export type HomeCommunitiesStatus = "loading" | "ready" | "error";

const PAGE_SIZE = 20;

export type UseHomeCommunities = {
  communities: CommunityDTO[];
  status: HomeCommunitiesStatus;
};

export function useHomeCommunities(): UseHomeCommunities {
  const [communities, setCommunities] = useState<CommunityDTO[]>([]);
  const [status, setStatus] = useState<HomeCommunitiesStatus>("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await listCommunities({
        page: 1,
        pageSize: PAGE_SIZE,
        search: "",
      });
      if (!active) return;
      if (result.ok) {
        setCommunities(result.data.data.filter((c) => c.membership !== null));
        setStatus("ready");
      } else {
        setStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { communities, status };
}
