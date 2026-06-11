import { useCallback, useState } from "react";
import type { ConsentType } from "@shared/types";
import { isConsentValid } from "@/validation/auth";

// Tracks which consent purposes the user has affirmatively checked. Nothing is
// pre-selected (COMPLIANCE §5.1 — consent must be active, not pre-ticked).
// `isValid` is the submission gate: account_creation must be present.

export function useConsent(initial: ConsentType[] = []) {
  const [selected, setSelected] = useState<ConsentType[]>(initial);

  const toggle = useCallback((type: ConsentType) => {
    setSelected((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  }, []);

  return { selected, toggle, isValid: isConsentValid(selected) };
}
