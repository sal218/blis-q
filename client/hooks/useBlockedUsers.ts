import { useCallback, useEffect, useState } from "react";
import { listBlocks, unblockUser } from "@/lib/api/safety";
import { blocksApiErrorMessage } from "@/lib/messages";
import type { PublicUser } from "@shared/types";

// Data hook for the blocked-users screen: load the caller's blocks and unblock
// (removing the row on success). The screen renders the returned state and wires
// the buttons (ENGINEERING_STANDARDS §4).

export type BlockedUsersStatus = "loading" | "ready" | "error";

export type UseBlockedUsers = {
  blocks: PublicUser[];
  status: BlockedUsersStatus;
  errorMessage: string | null;
  pendingIds: string[];
  reload: () => Promise<void>;
  unblock: (userId: string) => Promise<void>;
};

export function useBlockedUsers(): UseBlockedUsers {
  const [blocks, setBlocks] = useState<PublicUser[]>([]);
  const [status, setStatus] = useState<BlockedUsersStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Ids currently being unblocked, so the screen can disable just that row.
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setStatus("loading");
    const result = await listBlocks();
    if (result.ok) {
      setBlocks(result.data);
      setStatus("ready");
    } else {
      setErrorMessage(blocksApiErrorMessage(result.error));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const unblock = useCallback(async (userId: string) => {
    setPendingIds((ids) => [...ids, userId]);
    setErrorMessage(null);
    const result = await unblockUser(userId);
    setPendingIds((ids) => ids.filter((id) => id !== userId));
    if (result.ok) {
      setBlocks((prev) => prev.filter((user) => user.id !== userId));
    } else {
      setErrorMessage(blocksApiErrorMessage(result.error));
    }
  }, []);

  return { blocks, status, errorMessage, pendingIds, reload, unblock };
}
