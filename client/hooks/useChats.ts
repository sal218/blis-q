import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listChats } from "@/lib/api/chat";
import { chatApiErrorMessage } from "@/lib/messages";
import type { ChatSummaryDTO } from "@shared/types";

// Data hook for the Messages inbox (the Chat tab). HTTP only — it refetches
// whenever the inbox gains focus so previews stay fresh. It opens NO Realtime
// subscription: subscribing to every community the user belongs to would breach
// the connection-lifecycle limit (TRANSFER §3.9 rule 3). Live updates happen
// inside a thread (one subscription), not here.

export type ChatsStatus = "loading" | "ready" | "error";

export type UseChats = {
  chats: ChatSummaryDTO[];
  status: ChatsStatus;
  errorMessage: string | null;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
};

export function useChats(): UseChats {
  const [chats, setChats] = useState<ChatSummaryDTO[]>([]);
  const [status, setStatus] = useState<ChatsStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Stale-response guard: only the latest request applies (a slow refresh that
  // resolves after a newer load is dropped).
  const seq = useRef(0);
  const loadedOnce = useRef(false);

  // "initial" = first load (full-screen spinner); "refresh" = user pull-to-refresh
  // (the RefreshControl spinner); "silent" = background refetch on re-focus (NO
  // spinner — like WhatsApp; a failure keeps the existing list rather than
  // flipping to an error screen).
  const load = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    const s = ++seq.current;
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "initial") setStatus("loading");

    const result = await listChats();

    if (mode === "refresh") setRefreshing(false);
    if (s !== seq.current) return;

    if (result.ok) {
      setChats(result.data);
      setErrorMessage(null);
      setStatus("ready");
    } else if (mode !== "silent") {
      setErrorMessage(chatApiErrorMessage(result.error));
      setStatus("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // First focus = full load; returning to the inbox = a SILENT background
      // refresh (no spinner). Explicit pull-to-refresh still shows the spinner.
      void load(loadedOnce.current ? "silent" : "initial");
      loadedOnce.current = true;
    }, [load]),
  );

  const refresh = useCallback(() => void load("refresh"), [load]);
  const retry = useCallback(() => void load("initial"), [load]);

  return { chats, status, errorMessage, refreshing, refresh, retry };
}
