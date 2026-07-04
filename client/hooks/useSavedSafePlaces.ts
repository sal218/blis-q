import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listSavedSafePlaces, unsaveSafePlace } from "@/lib/api/safePlaces";
import type { SafePlaceDTO } from "@shared/types";

// Data for the Saved → "Bezpieczne miejsca" tab: the caller's saved (bookmarked)
// places. Loads on first focus, then SILENTLY refetches on every later focus
// (saving elsewhere reflects here without a spinner). Same monotonic stale-guard
// as useSavedEvents. `toggleSave` here always means UNSAVE (every row is saved):
// optimistically REMOVE the row, then persist; on failure re-insert at its spot.
// The screen owns no fetching (ENG §1/§4).

export type SavedSafePlacesStatus = "loading" | "ready" | "error";

export type UseSavedSafePlaces = {
  places: SafePlaceDTO[];
  status: SavedSafePlacesStatus;
  toggleSave: (place: SafePlaceDTO) => void;
  retry: () => void;
};

export function useSavedSafePlaces(): UseSavedSafePlaces {
  const [places, setPlaces] = useState<SafePlaceDTO[]>([]);
  const [status, setStatus] = useState<SavedSafePlacesStatus>("loading");
  const loadedOnce = useRef(false);
  const requestSeq = useRef(0);
  // Mirror of `places` read synchronously by toggleSave (a React functional
  // updater does NOT run at call time, so we can't capture the removed index
  // from inside one). `commit` keeps the ref and state in lockstep.
  const placesRef = useRef<SafePlaceDTO[]>([]);
  const commit = useCallback((next: SafePlaceDTO[]) => {
    placesRef.current = next;
    setPlaces(next);
  }, []);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      const result = await listSavedSafePlaces();
      if (seq !== requestSeq.current) return; // superseded by a newer load → drop
      if (result.ok) {
        commit(result.data);
        setStatus("ready");
      } else if (!silent) {
        setStatus("error");
      }
    },
    [commit],
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

  // A tap on a saved row unsaves it → remove optimistically, then persist. On
  // failure restore it at its original index (unsave is idempotent). The index
  // is read synchronously from placesRef, not from inside a state updater.
  const toggleSave = useCallback(
    (place: SafePlaceDTO) => {
      const current = placesRef.current;
      const index = current.findIndex((p) => p.id === place.id);
      if (index === -1) return;
      commit(current.filter((p) => p.id !== place.id)); // optimistic remove
      const restore = () => {
        const now = placesRef.current;
        if (now.some((p) => p.id === place.id)) return; // already back
        const next = now.slice();
        next.splice(Math.min(index, next.length), 0, place);
        commit(next);
      };
      void (async () => {
        try {
          const result = await unsaveSafePlace(place.id);
          if (!result.ok) restore();
        } catch {
          restore();
        }
      })();
    },
    [commit],
  );

  return { places, status, toggleSave, retry };
}
