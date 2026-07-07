import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getResource } from "@/lib/api/resources";
import type { ResourceDTO } from "@shared/types";

// Data hook for a single resource's detail screen (P-37). Loads the resource by
// id, silently refetches on focus (e.g. after an admin edit), and exposes a
// retry. Read-only — no save/report (the DTO has no `saved`). The screen is a
// view layer; opening the external link is a screen concern (Linking).

export type ResourceDetailStatus = "loading" | "ready" | "error";

export type UseResource = {
  resource: ResourceDTO | null;
  status: ResourceDetailStatus;
  retry: () => void;
};

export function useResource(id: string): UseResource {
  const [resource, setResource] = useState<ResourceDTO | null>(null);
  const [status, setStatus] = useState<ResourceDetailStatus>("loading");

  const requestSeq = useRef(0);
  const loadedOnce = useRef(false);

  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      const result = await getResource(id);
      if (seq !== requestSeq.current) return; // superseded → drop
      if (result.ok) {
        setResource(result.data);
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

  return { resource, status, retry };
}
