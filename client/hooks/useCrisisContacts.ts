import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listCrisisContacts } from "@/lib/api/crisisContacts";
import { strings } from "@/i18n";
import type { CrisisContactDTO } from "@shared/types";

// Loads the crisis-contact list for the "Pomoc w kryzysie" screen. The whole
// curated list fits in one page (pageSize = the server max, 100), so we fetch it
// all once and let the SCREEN derive the 112 banner + filter the chips
// client-side — the banner must be available regardless of the active chip, and a
// short list doesn't warrant per-chip re-fetching. Refetch-on-focus (silent after
// the first load); a monotonic requestSeq drops superseded responses.

export type CrisisContactsStatus = "loading" | "ready" | "error";
type LoadMode = "replace" | "refresh" | "silent";

const FETCH_PAGE_SIZE = 100; // = MAX_OFFSET_PAGE_SIZE (server/validation.ts)

export type UseCrisisContacts = {
  items: CrisisContactDTO[];
  status: CrisisContactsStatus;
  errorMessage: string | null;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
};

export function useCrisisContacts(): UseCrisisContacts {
  const [items, setItems] = useState<CrisisContactDTO[]>([]);
  const [status, setStatus] = useState<CrisisContactsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);

  const fetchList = useCallback(async (mode: LoadMode) => {
    const seq = ++requestSeq.current;
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "replace") setStatus("loading");

    const result = await listCrisisContacts({ pageSize: FETCH_PAGE_SIZE });

    if (mode === "refresh") setRefreshing(false);
    if (seq !== requestSeq.current) return; // a newer load superseded this one

    if (result.ok) {
      const page = result.data;
      if (page.totalPages > 1) {
        // Not expected for a curated crisis list — surface it in dev rather than
        // silently truncating. Server-side pagination is a tracked follow-up.
        console.warn(
          `[useCrisisContacts] ${page.total} contacts exceed one page; only the first ${FETCH_PAGE_SIZE} are shown.`,
        );
      }
      setItems(page.data);
      setErrorMessage(null);
      setStatus("ready");
    } else if (mode !== "silent") {
      // A silent (focus) refetch that fails keeps the current list on screen.
      setErrorMessage(strings.crisis.loadError);
      setStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchList(loadedOnce.current ? "silent" : "replace");
      loadedOnce.current = true;
    }, [fetchList]),
  );

  const refresh = useCallback(() => fetchList("refresh"), [fetchList]);
  const retry = useCallback(() => fetchList("replace"), [fetchList]);

  return { items, status, errorMessage, refreshing, refresh, retry };
}
