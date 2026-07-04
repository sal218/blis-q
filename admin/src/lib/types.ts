// DTO shapes the admin dashboard consumes. The admin app has no @shared alias,
// so these mirror the server's response shapes (docs/API.md §2/§7/§12) — keep
// them in sync if the API contract changes.

export type OffsetPage<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CommunityDTO = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  memberCount: number;
  createdAt: string;
  membership: { role: string } | null;
};

// Safe places (docs/API.md §11/§14). Mirrors shared/types.ts SafePlaceDTO +
// SAFE_PLACE_CATEGORIES (the admin app has no @shared alias). Category is a
// frozen predefined venue-type — coarse, never an identity/orientation label.
export const SAFE_PLACE_CATEGORIES = [
  "cafe",
  "club",
  "bar",
  "ngo",
  "health",
  "community_center",
  "education",
  "service",
  "other",
] as const;

export type SafePlaceCategory = (typeof SAFE_PLACE_CATEGORIES)[number];

// Polish label + a distinct chip colour per category (admin display + picker).
export const SAFE_PLACE_CATEGORY_META: Record<
  SafePlaceCategory,
  { label: string; color: string }
> = {
  cafe: { label: "Kawiarnia", color: "#B45309" },
  club: { label: "Klub", color: "#7C3AED" },
  bar: { label: "Bar", color: "#DB2777" },
  ngo: { label: "Organizacja", color: "#059669" },
  health: { label: "Zdrowie", color: "#DC2626" },
  community_center: { label: "Centrum społeczności", color: "#4F46E5" },
  education: { label: "Edukacja", color: "#2563EB" },
  service: { label: "Usługa", color: "#0891B2" },
  other: { label: "Inne", color: "#6B7280" },
};

export type SafePlaceDTO = {
  id: string;
  name: string;
  category: SafePlaceCategory;
  description: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

// One OSM search result from POST /api/admin/safe-places/osm-search (SP-2). The
// admin curates these (tick + re-tag) before bulk-adding them as safe places.
export type OsmCandidate = {
  osmId: string;
  name: string;
  category: SafePlaceCategory;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export type ReportDTO = {
  id: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
};

// Admin-only report view — what GET /api/admin/reports returns (since #22): the
// public ReportDTO plus the moderation fields (reviewer/time/resolution).
export type AdminReportDTO = ReportDTO & {
  reviewedById: string | null;
  reviewedAt: string | null;
  resolution: string | null;
};

// Admin-only user view — what GET /api/admin/users(/:id) returns. Mirrors the
// admin-only AdminUserDTO in shared/types.ts (the admin app has no @shared
// alias). Includes email (admins manage accounts); never a public surface.
export type AdminUserDTO = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isPremium: boolean;
  createdAt: string;
  bannedAt: string | null;
  deletedAt: string | null;
};
