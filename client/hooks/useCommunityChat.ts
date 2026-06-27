import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, setRealtimeAuth } from "@/lib/supabase";
import {
  listCommunityMessages,
  sendMessage,
  deleteMessage,
  reportMessage,
} from "@/lib/api/chat";
import { listBlocks } from "@/lib/api/safety";
import { chatApiErrorMessage } from "@/lib/messages";
import type { MessageDTO } from "@shared/types";

// Data + realtime hook for a community chat thread (docs/API.md §9, TRANSFER
// §3.9). History is HTTP (cursor, newest-first → drives an inverted FlatList);
// new messages arrive live over the PRIVATE Supabase Broadcast channel
// `chat:{communityId}`. This hook is the SINGLE place chat subscriptions live.
//
// Connection lifecycle (MANDATORY — keeps us within Realtime connection limits):
//   • subscribe only while the thread is focused AND the app is foregrounded,
//   • unsubscribe (removeChannel) on blur/unmount,
//   • unsubscribe on AppState 'background'; resubscribe on 'active' (if focused).
//
// Live correctness: incoming messages are deduped by id (vs optimistic + history)
// and block-filtered client-side (a per-channel broadcast can't be filtered
// server-side; history/report ARE server-filtered). On every (re)subscribe we
// gap-fill by merging the latest page so messages missed while unsubscribed
// appear. Sends are optimistic, reconciled with the server DTO.

export type CommunityChatStatus = "loading" | "ready" | "error";

type LoadMode = "replace" | "refresh" | "more";

export type ChatActionOutcome = { ok: true } | { ok: false; message: string };

export type UseCommunityChat = {
  messages: MessageDTO[];
  status: CommunityChatStatus;
  errorMessage: string | null;
  refreshing: boolean;
  loadingMore: boolean;
  refresh: () => void;
  loadMore: () => void;
  retry: () => void;
  send: (content: string) => Promise<ChatActionOutcome>;
  remove: (messageId: string) => Promise<ChatActionOutcome>;
  report: (messageId: string, reason: string) => Promise<ChatActionOutcome>;
};

// Newest-first sort (ISO timestamps sort lexically); id breaks ties so the order
// is stable and matches the server's (createdAt, id) keyset.
function newestFirst(a: MessageDTO, b: MessageDTO): number {
  if (a.createdAt !== b.createdAt) return b.createdAt < a.createdAt ? -1 : 1;
  return b.id < a.id ? -1 : 1;
}

export function useCommunityChat(
  communityId: string,
  currentUserId: string | null,
): UseCommunityChat {
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<CommunityChatStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const requestSeq = useRef(0);
  const blockedIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isFocused = useRef(false);

  const isBlocked = (m: MessageDTO): boolean =>
    !!m.sender?.id && blockedIds.current.has(m.sender.id);

  const fetchPage = useCallback(
    async (cursor: string | undefined, mode: LoadMode) => {
      const seq = ++requestSeq.current;
      if (mode === "more") setLoadingMore(true);
      else if (mode === "refresh") setRefreshing(true);
      else setStatus("loading");

      const result = await listCommunityMessages(communityId, cursor);

      if (mode === "more") setLoadingMore(false);
      else if (mode === "refresh") setRefreshing(false);

      // A newer request superseded this one — drop it (flags already reset).
      if (seq !== requestSeq.current) return;

      if (result.ok) {
        const page = result.data;
        setMessages((prev) =>
          mode === "more" ? [...prev, ...page.data] : page.data,
        );
        setNextCursor(page.nextCursor);
        setErrorMessage(null);
        setStatus("ready");
      } else if (mode !== "more") {
        setErrorMessage(chatApiErrorMessage(result.error));
        setStatus("error");
      }
    },
    [communityId],
  );

  // Load the caller's block list once so live messages can be filtered (history
  // + report are already server-filtered). Best-effort: a failure just means no
  // client-side filtering this session.
  const loadBlockedIds = useCallback(async () => {
    const result = await listBlocks();
    if (result.ok) blockedIds.current = new Set(result.data.map((u) => u.id));
  }, []);

  useEffect(() => {
    void fetchPage(undefined, "replace");
    void loadBlockedIds();
  }, [fetchPage, loadBlockedIds]);

  // A live message: ignore blocked senders + duplicates (by id).
  const handleIncoming = useCallback((dto: MessageDTO) => {
    if (dto.sender?.id && blockedIds.current.has(dto.sender.id)) return;
    setMessages((prev) =>
      prev.some((m) => m.id === dto.id) ? prev : [dto, ...prev],
    );
  }, []);

  // On (re)subscribe, merge the latest page so anything missed while
  // unsubscribed appears (without dropping already-loaded older pages).
  const gapFill = useCallback(async () => {
    const result = await listCommunityMessages(communityId);
    if (!result.ok) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = result.data.data.filter(
        (m) => !seen.has(m.id) && !isBlocked(m),
      );
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].sort(newestFirst);
    });
  }, [communityId]);

  const subscribe = useCallback(async () => {
    if (channelRef.current) return;
    await setRealtimeAuth(); // private-channel auth needs the user JWT
    const channel = supabase.channel(`chat:${communityId}`, {
      config: { private: true },
    });
    channel.on("broadcast", { event: "new_message" }, (msg) => {
      handleIncoming(msg.payload as MessageDTO);
    });
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") void gapFill();
    });
    channelRef.current = channel;
  }, [communityId, handleIncoming, gapFill]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  // Subscribe on focus, unsubscribe on blur/unmount.
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      void subscribe();
      return () => {
        isFocused.current = false;
        unsubscribe();
      };
    }, [subscribe, unsubscribe]),
  );

  // Drop the socket in the background; restore on foreground (only if focused).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") unsubscribe();
      else if (state === "active" && isFocused.current) void subscribe();
    });
    return () => sub.remove();
  }, [subscribe, unsubscribe]);

  const refresh = useCallback(
    () => fetchPage(undefined, "refresh"),
    [fetchPage],
  );
  const retry = useCallback(() => fetchPage(undefined, "replace"), [fetchPage]);

  const loadMore = useCallback(() => {
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

  // Optimistic send: show the message immediately (temp id), then reconcile with
  // the server DTO. If the broadcast echo arrives first, dedup on the real id.
  const send = useCallback(
    async (content: string): Promise<ChatActionOutcome> => {
      if (!currentUserId)
        return {
          ok: false,
          message: chatApiErrorMessage({ kind: "forbidden" }),
        };
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: MessageDTO = {
        id: tempId,
        communityId,
        sender: { id: currentUserId, displayName: "", avatarUrl: null },
        content,
        createdAt: new Date().toISOString(),
        deleted: false,
      };
      setMessages((prev) => [optimistic, ...prev]);

      const result = await sendMessage(communityId, content);
      if (!result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return { ok: false, message: chatApiErrorMessage(result.error) };
      }
      const real = result.data;
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === real.id)
          ? withoutTemp
          : [real, ...withoutTemp];
      });
      return { ok: true };
    },
    [communityId, currentUserId],
  );

  // Delete → mark the message deleted in place (tombstone), matching the server.
  const remove = useCallback(
    async (messageId: string): Promise<ChatActionOutcome> => {
      const result = await deleteMessage(messageId);
      if (!result.ok) {
        return { ok: false, message: chatApiErrorMessage(result.error) };
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, deleted: true, sender: null, content: "[deleted]" }
            : m,
        ),
      );
      return { ok: true };
    },
    [],
  );

  const report = useCallback(
    async (messageId: string, reason: string): Promise<ChatActionOutcome> => {
      const result = await reportMessage(messageId, reason);
      if (result.ok) return { ok: true };
      return { ok: false, message: chatApiErrorMessage(result.error) };
    },
    [],
  );

  return {
    messages,
    status,
    errorMessage,
    refreshing,
    loadingMore,
    refresh,
    loadMore,
    retry,
    send,
    remove,
    report,
  };
}
