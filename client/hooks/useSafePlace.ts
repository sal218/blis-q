import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  getSafePlace,
  reportSafePlace,
  saveSafePlace,
  unsaveSafePlace,
} from "@/lib/api/safePlaces";
import { safePlacesApiErrorMessage } from "@/lib/messages";
import type { SafePlaceDTO } from "@shared/types";

// Data hook for a single safe place's detail screen (P-40). Loads the place by
// id (a fresh `saved` + a fresh signed imageUrl — list URLs are ~1h), silently
// refetches on focus (e.g. after the admin edits it), toggles the caller's save
// optimistically (revert-on-failure + a per-flight guard, mirroring useEvent),
// and submits a moderation report. No local business logic beyond that — the
// screen is a view layer.

export type SafePlaceDetailStatus = "loading" | "ready" | "error";

// Same shape as PostActionOutcome so `report` plugs straight into ReportPostModal.
export type SafePlaceOutcome = { ok: true } | { ok: false; message: string };

export type UseSafePlace = {
  place: SafePlaceDTO | null;
  status: SafePlaceDetailStatus;
  saving: boolean; // a save toggle is in flight (Save button disabled)
  retry: () => void;
  toggleSave: () => void;
  report: (reason: string) => Promise<SafePlaceOutcome>;
};

export function useSafePlace(id: string): UseSafePlace {
  const [place, setPlace] = useState<SafePlaceDTO | null>(null);
  const [status, setStatus] = useState<SafePlaceDetailStatus>("loading");
  const [saving, setSaving] = useState(false);

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);
  const savingRef = useRef(false);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      const result = await getSafePlace(id);
      if (seq !== requestSeq.current) return; // superseded → drop
      if (result.ok) {
        setPlace(result.data);
        setStatus("ready");
      } else if (!silent) {
        setStatus("error");
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      void load(loadedOnce.current);
      loadedOnce.current = true;
    }, [load]),
  );

  const retry = useCallback(() => {
    void load(false);
  }, [load]);

  // Toggle the caller's bookmark. Optimistic flip + revert-on-failure; a
  // per-flight guard serialises rapid taps (mirrors useEvent.toggleSave). Bump
  // requestSeq first so a slow in-flight load can't clobber the optimistic flip.
  const toggleSave = useCallback(() => {
    if (!place || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const prevSaved = place.saved;

    requestSeq.current++;
    setPlace((prev) => (prev ? { ...prev, saved: !prevSaved } : prev));
    const revert = () =>
      setPlace((prev) => (prev ? { ...prev, saved: prevSaved } : prev));

    void (async () => {
      try {
        const result = prevSaved
          ? await unsaveSafePlace(place.id)
          : await saveSafePlace(place.id);
        if (!result.ok) revert();
      } catch {
        revert();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    })();
  }, [place]);

  // Submit a moderation report (no local state change). The outcome message is
  // mapped for the ReportPostModal.
  const report = useCallback(
    async (reason: string): Promise<SafePlaceOutcome> => {
      const result = await reportSafePlace(id, reason);
      if (result.ok) return { ok: true };
      return { ok: false, message: safePlacesApiErrorMessage(result.error) };
    },
    [id],
  );

  return { place, status, saving, retry, toggleSave, report };
}
