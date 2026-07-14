import type { NewsCategory } from "@shared/types";

// Per-category accent colour for the News feature (design ref:
// assets/news-feed-*.png) — the card's category tile + read-only chip. Keyed to
// NEWS_CATEGORIES; a new category is a compile error until it gets a colour.
// These are display accents only (never identity signalling — the categories are
// coarse editorial topics). Kept in sync with the admin portal's
// NEWS_CATEGORY_META so both apps match.
export const NEWS_CATEGORY_COLORS: Record<NewsCategory, string> = {
  rights: "#2563EB", // blue
  community: "#F97316", // orange
  health: "#EC4899", // pink
  world: "#10B981", // emerald
};
