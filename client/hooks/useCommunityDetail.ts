import { useCallback, useEffect, useState } from "react";
import {
  getCommunity,
  joinCommunity,
  leaveCommunity,
} from "@/lib/api/communities";
import { communityApiErrorMessage } from "@/lib/messages";
import { strings } from "@/i18n";
import type { CommunityDTO } from "@shared/types";

// Data hook for the community detail screen: load + join/leave. The screen
// renders the returned state and wires the buttons (ENGINEERING_STANDARDS §4).
//
// Both join and leave can return 409 → `conflict`; the hook knows which action
// it ran, so it picks the right copy (already-member vs sole-admin) rather than
// the screen — and never parses the server's error string.

export type CommunityDetailStatus = "loading" | "ready" | "error";

export type UseCommunityDetail = {
  community: CommunityDTO | null;
  status: CommunityDetailStatus;
  loadError: string | null;
  actionLoading: boolean;
  actionError: string | null;
  reload: () => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
};

export function useCommunityDetail(id: string): UseCommunityDetail {
  const [community, setCommunity] = useState<CommunityDTO | null>(null);
  const [status, setStatus] = useState<CommunityDetailStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    const result = await getCommunity(id);
    if (result.ok) {
      setCommunity(result.data);
      setStatus("ready");
    } else {
      setLoadError(
        communityApiErrorMessage(result.error, strings.errors.generic),
      );
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const join = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    const result = await joinCommunity(id);
    setActionLoading(false);
    if (result.ok) {
      await reload();
    } else {
      setActionError(
        communityApiErrorMessage(
          result.error,
          strings.communities.alreadyMember,
        ),
      );
    }
  }, [id, reload]);

  const leave = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    const result = await leaveCommunity(id);
    setActionLoading(false);
    if (result.ok) {
      await reload();
    } else {
      setActionError(
        communityApiErrorMessage(
          result.error,
          strings.communities.leaveSoleAdmin,
        ),
      );
    }
  }, [id, reload]);

  return {
    community,
    status,
    loadError,
    actionLoading,
    actionError,
    reload,
    join,
    leave,
  };
}
