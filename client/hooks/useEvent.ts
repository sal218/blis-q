import { useCallback, useEffect, useRef, useState } from "react";
import { getEvent, setRsvp as apiSetRsvp } from "@/lib/api/events";
import { eventsApiErrorMessage } from "@/lib/messages";
import type { EventDTO, RsvpStatus } from "@shared/types";

// Data hook for a single event's detail + the caller's RSVP. Loads the event,
// then upserts the RSVP. On a successful RSVP it patches local state: the caller's
// own status, and goingCount by the going-delta (the endpoint returns the stored
// status only — never an attendee list). A failed RSVP leaves state unchanged.

export type EventDetailStatus = "loading" | "ready" | "error";

export type RsvpOutcome = { ok: true } | { ok: false; message: string };

export type UseEvent = {
  event: EventDTO | null;
  status: EventDetailStatus;
  errorMessage: string | null;
  submitting: boolean;
  retry: () => void;
  setRsvp: (status: RsvpStatus) => Promise<RsvpOutcome>;
};

// goingCount delta from a status change: entering "going" +1, leaving "going" −1,
// anything else 0 (interested ↔ not_going doesn't change the going tally).
function goingDelta(from: RsvpStatus | null, to: RsvpStatus): number {
  return (to === "going" ? 1 : 0) - (from === "going" ? 1 : 0);
}

export function useEvent(eventId: string): UseEvent {
  const [event, setEvent] = useState<EventDTO | null>(null);
  const [status, setStatus] = useState<EventDetailStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    const result = await getEvent(eventId);
    if (seq !== requestSeq.current) return;
    if (result.ok) {
      setEvent(result.data);
      setErrorMessage(null);
      setStatus("ready");
    } else {
      setErrorMessage(eventsApiErrorMessage(result.error));
      setStatus("error");
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    load();
  }, [load]);

  const setRsvp = useCallback(
    async (next: RsvpStatus): Promise<RsvpOutcome> => {
      setSubmitting(true);
      const result = await apiSetRsvp(eventId, next);
      setSubmitting(false);
      if (!result.ok) {
        return { ok: false, message: eventsApiErrorMessage(result.error) };
      }
      // Invalidate any in-flight load so a slow getEvent can't clobber this, then
      // patch in place (functional updater guards against a stale snapshot).
      requestSeq.current++;
      setEvent((prev) => {
        if (!prev) return prev;
        const delta = goingDelta(prev.rsvp?.status ?? null, result.data.status);
        return {
          ...prev,
          rsvp: { status: result.data.status },
          goingCount: Math.max(0, prev.goingCount + delta),
        };
      });
      return { ok: true };
    },
    [eventId],
  );

  return { event, status, errorMessage, submitting, retry, setRsvp };
}
