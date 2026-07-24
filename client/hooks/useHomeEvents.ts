import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listMyEvents } from "@/lib/api/events";
import { isTransientRailError, railRetryDelay } from "@/hooks/homeRailRetry";
import type { EventDTO } from "@shared/types";

// Data for the Home "Upcoming events" rail: the caller's OWN upcoming events
// (the ones they RSVP'd "going" to). Loads on first focus, then SILENTLY
// refetches on every later focus — so RSVP'ing on an event and returning to the
// Home tab updates the rail without a spinner. A silent failure keeps the list.
// The screen owns no fetching (ENGINEERING_STANDARDS §1/§4).
//
// Stale-response guard (mirrors useEvents/useChats): every load bumps a
// monotonic sequence id; a response is applied only if its id is still the
// latest — so a slow refetch resolving after a newer focus can't overwrite the
// fresher result.

export type HomeEventsStatus = "loading" | "ready" | "error";

export type UseHomeEvents = {
  events: EventDTO[];
  status: HomeEventsStatus;
  retry: () => void;
};

export function useHomeEvents(): UseHomeEvents {
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [status, setStatus] = useState<HomeEventsStatus>("loading");
  const loadedOnce = useRef(false);
  const requestSeq = useRef(0);

  const load = useCallback(async (silent: boolean) => {
    const seq = ++requestSeq.current;
    if (!silent) setStatus("loading");
    let result = await listMyEvents();
    if (seq !== requestSeq.current) return; // superseded by a newer load → drop

    // Cold-start resilience: a transient failure on the INITIAL/explicit load is
    // usually a race with app launch — auto-retry ONCE after a short delay before
    // showing the error (mirrors a manual navigate-away-and-back). See
    // hooks/homeRailRetry.ts. Silent refetches keep the list, so they don't retry.
    if (!silent && !result.ok && isTransientRailError(result.error)) {
      await railRetryDelay();
      if (seq !== requestSeq.current) return; // superseded during the wait → drop
      result = await listMyEvents();
      if (seq !== requestSeq.current) return;
    }

    if (result.ok) {
      setEvents(result.data);
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

  return { events, status, retry };
}
