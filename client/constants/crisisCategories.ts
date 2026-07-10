import type { CrisisContactCategory } from "@shared/types";

// Per-category accent colour for the crisis "Pomoc w kryzysie" page (design ref:
// assets/safety-page-*.png) — the tinted icon disc on each contact card + the
// filter chips. Keyed to CRISIS_CONTACT_CATEGORIES; a new category is a compile
// error until it gets a colour. Display accents only — the categories are coarse
// SERVICE types, never identity signalling. Kept in sync with the admin portal's
// CRISIS_CONTACT_CATEGORY_META so both apps match.
export const CRISIS_CATEGORY_COLORS: Record<CrisisContactCategory, string> = {
  emergency: "#DC2626", // red
  emotional_crisis: "#7C3AED", // violet
  legal: "#2563EB", // blue
  community: "#F97316", // orange
};
