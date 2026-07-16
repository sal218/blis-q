import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { listSafePlaceMarkers } from "@/lib/api/safePlaces";
import type { SafePlaceMarkerDTO, SafePlaceCategory } from "@shared/types";

// Data hook for the Safe Places map (P-40 SP-4). Fetches the trimmed marker
// feed (every visible venue with coordinates) once per focus. The map plots all
// pins at once, so this is unpaginated (the endpoint caps it). Read-only, no
// local business logic — the screen is a view layer. Optional filters mirror the
// list so a filtered map is possible later; slice 1 passes none.

export type SafePlaceMarkersStatus = "loading" | "ready" | "error";

export type UseSafePlaceMarkers = {
  markers: SafePlaceMarkerDTO[];
  status: SafePlaceMarkersStatus;
  retry: () => void;
};

export function useSafePlaceMarkers(
  filters: {
    category?: SafePlaceCategory;
    city?: string;
    search?: string;
  } = {},
): UseSafePlaceMarkers {
  const [markers, setMarkers] = useState<SafePlaceMarkerDTO[]>([]);
  const [status, setStatus] = useState<SafePlaceMarkersStatus>("loading");

  const requestSeq = useRef(0);
  const { category, city, search } = filters;

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setStatus("loading");
    const result = await listSafePlaceMarkers({ category, city, search });
    if (seq !== requestSeq.current) return; // superseded → drop
    if (result.ok) {
      setMarkers(result.data);
      setStatus("ready");
    } else {
      setStatus("error");
    }
  }, [category, city, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const retry = useCallback(() => {
    void load();
  }, [load]);

  return { markers, status, retry };
}
