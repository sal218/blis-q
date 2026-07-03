import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listSavedEvents } from "@/lib/api/events";
import type { EventDTO } from "@shared/types";

// Data for the Saved-events screen: the caller's saved (bookmarked) upcoming
// events. Loads on first focus, then SILENTLY refetches on every later focus —
// so un-saving from the detail screen and returning updates the list without a
// spinner. Exposes `retry` for the error state. Same monotonic stale-response
// guard as useHomeEvents/useEvents: a slow refetch resolving after a newer focus
// can't overwrite the fresher result. The screen owns no fetching (ENG §1/§4).

export type SavedEventsStatus = "loading" | "ready" | "error";

export type UseSavedEvents = {
  events: EventDTO[];
  status: SavedEventsStatus;
  retry: () => void;
};

export function useSavedEvents(): UseSavedEvents {
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [status, setStatus] = useState<SavedEventsStatus>("loading");
  const loadedOnce = useRef(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    const seq = ++requestSeq.current;
    if (!silent) setStatus("loading");
    const result = await listSavedEvents();
    if (seq !== requestSeq.current) return; // superseded by a newer load → drop
    if (result.ok) {
      setEvents(result.data);
      setStatus("ready");
    } else if (!silent) {
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

  return { events, status, retry };
}
