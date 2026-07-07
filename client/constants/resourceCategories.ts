import type { ResourceCategory } from "@shared/types";

// Per-category accent colour for the Resources feature (design ref:
// assets/profile-resources.png) — the tinted category cards + the card/detail
// icon disc. Keyed to RESOURCE_CATEGORIES; a new category is a compile error
// until it gets a colour. These are display accents only (never identity
// signalling — the categories are coarse content topics). The mobile palette
// follows the mockup (purple/green/orange/blue/pink/amber), which differs from
// the admin portal's internal chip colours by design.
export const RESOURCE_CATEGORY_COLORS: Record<ResourceCategory, string> = {
  mental_health: "#7C3AED", // violet
  legal_rights: "#10B981", // emerald
  community_orgs: "#F97316", // orange
  education_careers: "#2563EB", // blue
  health_services: "#EC4899", // pink
  housing_support: "#F59E0B", // amber
};
