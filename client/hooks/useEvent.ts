import { useCallback, useEffect, useRef, useState } from "react";
import {
  getEvent,
  setRsvp as apiSetRsvp,
  reportEvent as apiReportEvent,
  cancelEvent as apiCancelEvent,
  saveEvent as apiSaveEvent,
  unsaveEvent as apiUnsaveEvent,
} from "@/lib/api/events";
import {
  eventsApiErrorMessage,
  cancelEventApiErrorMessage,
} from "@/lib/messages";
import type { EventDTO, RsvpStatus } from "@shared/types";

// Data hook for a single event's detail + the caller's RSVP. Loads the event,
// then upserts the RSVP. On a successful RSVP it patches local state: the caller's
// own status, and goingCount by the going-delta (the endpoint returns the stored
// status only — never an attendee list). A failed RSVP leaves state unchanged.

export type EventDetailStatus = "loading" | "ready" | "error";

// ok, or a mapped Polish message. Same shape as PostActionOutcome so it plugs
// straight into the shared ReportPostModal. Covers both RSVP and report.
export type RsvpOutcome = { ok: true } | { ok: false; message: string };

export type UseEvent = {
  event: EventDTO | null;
  status: EventDetailStatus;
  errorMessage: string | null;
  submitting: boolean;
  retry: () => void;
  setRsvp: (status: RsvpStatus) => Promise<RsvpOutcome>;
  report: (reason: string) => Promise<RsvpOutcome>;
  cancel: () => Promise<RsvpOutcome>;
  toggleSave: () => Promise<RsvpOutcome>;
  saving: boolean; // a save toggle is in flight (Save button disabled)
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
  const [saving, setSaving] = useState(false);

  const requestSeq = useRef(0);
  // Synchronous guard: serialize save toggles so a rapid save→unsave double-tap
  // can't dispatch a POST and DELETE concurrently (which could land out of order
  // and diverge from the optimistic UI). A tap while one is in flight is ignored.
  const savingRef = useRef(false);

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

  // OPTIMISTIC: flip the caller's rsvp + goingCount IMMEDIATELY (so the UI reacts
  // instantly, not after the network round-trip), bumping requestSeq first so a
  // slow in-flight load can't clobber it; revert exactly this change on failure.
  // `submitting` serializes taps. prev values are captured from the event closure.
  const setRsvp = useCallback(
    async (next: RsvpStatus): Promise<RsvpOutcome> => {
      if (!event || submitting) return { ok: true };
      const prevRsvp = event.rsvp;
      const prevGoingCount = event.goingCount;
      const delta = goingDelta(prevRsvp?.status ?? null, next);

      setSubmitting(true);
      requestSeq.current++;
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              rsvp: { status: next },
              goingCount: Math.max(0, prev.goingCount + delta),
            }
          : prev,
      );

      const result = await apiSetRsvp(eventId, next);
      setSubmitting(false);
      if (!result.ok) {
        setEvent((prev) =>
          prev ? { ...prev, rsvp: prevRsvp, goingCount: prevGoingCount } : prev,
        );
        return { ok: false, message: eventsApiErrorMessage(result.error) };
      }
      return { ok: true };
    },
    [eventId, event, submitting],
  );

  // Submit a moderation report for this event (no local state change). 404 =
  // the event is no longer visible; the message is mapped for the screen.
  const report = useCallback(
    async (reason: string): Promise<RsvpOutcome> => {
      const result = await apiReportEvent(eventId, reason);
      if (result.ok) return { ok: true };
      return { ok: false, message: eventsApiErrorMessage(result.error) };
    },
    [eventId],
  );

  // Creator cancels the event. On success, patch local state to cancelled (the
  // event stays visible with its content; canCancel flips off) using the same
  // stale-guard as setRsvp so a slow in-flight load can't clobber it. Uses the
  // cancel-specific error mapper (403 = not the creator, not an RSVP message).
  const cancel = useCallback(async (): Promise<RsvpOutcome> => {
    setSubmitting(true);
    const result = await apiCancelEvent(eventId);
    setSubmitting(false);
    if (!result.ok) {
      return { ok: false, message: cancelEventApiErrorMessage(result.error) };
    }
    requestSeq.current++;
    setEvent((prev) =>
      prev
        ? {
            ...prev,
            status: "cancelled",
            cancelledAt: new Date().toISOString(),
            canCancel: false,
          }
        : prev,
    );
    return { ok: true };
  }, [eventId]);

  // Toggle the caller's save/bookmark. OPTIMISTIC: bump requestSeq FIRST (so a
  // slow in-flight load() — which drops its result when the seq no longer matches
  // — can't clobber the optimistic UI), then flip `saved` immediately. On failure
  // revert exactly that flip. `prevSaved` is read from the current event closure
  // (event is a dep), so the decision (save vs unsave) matches what the user saw.
  const toggleSave = useCallback(async (): Promise<RsvpOutcome> => {
    // Ignore a tap while a save toggle is already in flight (serialized).
    if (!event || savingRef.current) return { ok: true };
    savingRef.current = true;
    setSaving(true);
    const prevSaved = event.saved;

    requestSeq.current++;
    setEvent((prev) => (prev ? { ...prev, saved: !prevSaved } : prev));

    const result = prevSaved
      ? await apiUnsaveEvent(eventId)
      : await apiSaveEvent(eventId);
    savingRef.current = false;
    setSaving(false);
    if (!result.ok) {
      setEvent((prev) => (prev ? { ...prev, saved: prevSaved } : prev));
      return { ok: false, message: eventsApiErrorMessage(result.error) };
    }
    return { ok: true };
  }, [eventId, event]);

  return {
    event,
    status,
    errorMessage,
    submitting,
    retry,
    setRsvp,
    report,
    cancel,
    toggleSave,
    saving,
  };
}
