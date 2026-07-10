// Shared API DTOs and envelopes — the over-the-wire shapes used by the mobile
// app, the admin dashboard, and the Express backend. These are CLIENT-FACING
// contract types: dates are ISO-8601 strings (not Date), author/sender fields
// are always PublicUser (never raw user rows), and internal columns are omitted.
// They intentionally differ from the Drizzle `$inferSelect` row types in
// shared/schema.ts. See docs/API.md for the full contract.
//
// 🚧 = provisional pending DPIA (COMPLIANCE_AND_PRIVACY.md §4).

// ── Envelopes ─────────────────────────────────────────────────────────────────

/** Every error response uses this shape (ENGINEERING_STANDARDS §6). */
export type ErrorResponse = {
  error: string;
  details?: unknown;
};

/** Rate-limit (429) body. */
export type RateLimitedResponse = {
  error: "Rate limit exceeded";
  retryAfter: number; // seconds
};

/** Cursor pagination — recency feeds (posts, messages, events). */
export type CursorPage<T> = {
  data: T[];
  nextCursor: string | null; // null ⇒ end of list; opaque to clients
};

export type CursorQuery = {
  limit?: number; // 1..50, default 20
  cursor?: string;
};

/** Offset/page pagination — admin tables, catalog/search. */
export type OffsetPage<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type OffsetQuery = {
  page?: number; // 1-based, default 1
  pageSize?: number; // 1..100, default 25
  sort?: string;
  order?: "asc" | "desc";
};

// ── Enums (string unions) ─────────────────────────────────────────────────────

export type ConsentType =
  | "account_creation"
  | "marketing_emails"
  | "analytics"
  | "location_data";

export type MembershipRole = "member" | "moderator" | "admin";
export type RsvpStatus = "going" | "interested" | "not_going";
export type ReportResourceType =
  | "post"
  | "message"
  | "user"
  | "event"
  | "community"
  | "safe_place";
export type DevicePlatform = "ios" | "android" | "web";
export type SubscriptionStatus =
  | "active"
  | "expired"
  | "cancelled"
  | "in_grace";

// ── Users ─────────────────────────────────────────────────────────────────────

/** What other users see. Anonymity model: NEVER includes email. */
export type PublicUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

/** The authenticated caller's own account. */
export type AccountProfile = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  isAdmin: boolean;
  preferredCity: string | null; // 🚧 city-level only, no GPS (COMPLIANCE §5.8)
  createdAt: string;
};

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

/** Returned by signup / login / google. */
export type SessionResponse = {
  user: AccountProfile;
  session: SessionTokens;
};

// ── Resource DTOs ─────────────────────────────────────────────────────────────

export type CommunityDTO = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  memberCount: number;
  createdAt: string;
  membership: { role: MembershipRole } | null; // caller's membership, if any
};

export type PostDTO = {
  id: string;
  communityId: string;
  author: PublicUser | null; // null when deleted/anonymised
  content: string; // "[deleted]" when removed
  imageUrl: string | null;
  createdAt: string;
  deleted: boolean;
};

export type MessageDTO = {
  id: string;
  communityId: string;
  sender: PublicUser | null; // null when deleted/anonymised
  content: string; // "[deleted]" when removed
  createdAt: string;
  deleted: boolean;
};

// One row of the Messages inbox (Chat tab): a community the caller belongs to,
// the caller's role there, and the latest (block-filtered) message as a preview.
// lastMessage is null when the community has no visible messages yet.
export type ChatSummaryDTO = {
  community: { id: string; name: string; imageUrl: string | null };
  role: MembershipRole;
  lastMessage: MessageDTO | null;
};

// Predefined event categories (slice D). Coarse, creator-chosen event-TYPE tags
// used for browsing/filtering — deliberately NOT identity/orientation labels, so
// a category can never infer Article 9 special-category data. This tuple is the
// single source of truth: the Zod validator (server/validation.ts) enums over it
// and the mobile picker/chips (D2) label these keys in Polish. Keys are FROZEN
// once events carry them; add new ones by appending, never renaming/removing.
export const EVENT_CATEGORIES = [
  "social",
  "support",
  "activism",
  "education",
  "culture",
  "sports",
  "health",
  "other",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type EventDTO = {
  id: string;
  communityId: string;
  title: string;
  description: string | null;
  location: string | null; // free-text venue; 🚧 no pin coordinates in v1
  startsAt: string;
  endsAt: string | null;
  imageUrl: string | null;
  createdAt: string;
  goingCount: number; // attendees with status "going" (aggregate; no identities)
  rsvp: { status: RsvpStatus } | null; // caller's RSVP, if any
  deleted: boolean; // tombstone: title → "[deleted]", creator hidden
  status: "active" | "cancelled"; // lifecycle; a cancelled event keeps its content
  cancelledAt: string | null; // when it was cancelled (null while active)
  past: boolean; // server-computed: startsAt is in the past (RSVP-closed)
  // Capability flag for the caller: may they cancel this event now? True only for
  // the creator on an active, non-past, non-deleted event. Never leaks WHO the
  // creator is — just whether the caller holds the cancel capability.
  canCancel: boolean;
  saved: boolean; // whether the CALLER has saved/bookmarked this event (private)
  category: EventCategory | null; // predefined event-type tag, or null (unset)
};

// Predefined safe-place categories (Sprint 7). Coarse VENUE-TYPE tags for
// browsing/filtering — deliberately never identity/orientation labels, so a
// category can't infer Article 9 data (mirrors EVENT_CATEGORIES). The Zod
// validator (server/validation.ts) enums over this tuple; the admin picker
// labels these keys. FROZEN once venues carry them — append, never rename.
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

// Predefined venue accessibility features (P-40). ADMIN-VERIFIED + confirmed-
// present-only: a feature appears on a place only when the curating team has
// affirmed it. Absent = UNKNOWN, never rendered as "not accessible" (a false
// positive would send an at-risk user to a place they can't use). 🔒 Deliberately
// venue attributes (they describe the PLACE, not the user — Article-9-safe),
// never identity/orientation. A frozen set (like SAFE_PLACE_CATEGORIES); the
// client extends it. Custom/free-text is rejected.
export const ACCESSIBILITY_FEATURES = [
  "wheelchair_accessible",
  "gender_neutral_restroom",
  "free_wifi",
] as const;

export type AccessibilityFeature = (typeof ACCESSIBILITY_FEATURES)[number];

// Type guard used server-side to DEFENSIVELY narrow the raw stored text[] to the
// known set before it reaches the DTO (drops any legacy/unknown array element).
export function isAccessibilityFeature(v: string): v is AccessibilityFeature {
  return (ACCESSIBILITY_FEATURES as readonly string[]).includes(v);
}

export type SafePlaceDTO = {
  id: string;
  name: string;
  category: SafePlaceCategory;
  description: string | null;
  address: string | null;
  city: string | null;
  // Venue coordinates (admin-curated venue data, NOT user location — §5.8).
  latitude: number | null;
  longitude: number | null;
  // A short-lived signed URL for the admin-uploaded venue photo, or null. The
  // underlying R2 object key is NEVER exposed (private bucket, signed reads only).
  imageUrl: string | null;
  // Admin-verified accessibility features that are CONFIRMED PRESENT (may be []).
  // Absence of a feature means "unknown", never "not accessible".
  accessibilityFeatures: AccessibilityFeature[];
  // The caller's OWN private bookmark flag. No count / who-saved surface
  // (Article 9), mirroring EventDTO.saved. Admin responses set this false.
  saved: boolean;
};

// Predefined Support & Education resource categories (P-37, from
// assets/profile-resources.png). Coarse CONTENT topics for browsing/filtering —
// admin-curated, 🔒 deliberately never identity/orientation labels (a category
// can't infer Article 9 data; mirrors SAFE_PLACE_CATEGORIES). The Zod validator
// enums over this tuple. FROZEN — append, never rename.
export const RESOURCE_CATEGORIES = [
  "mental_health",
  "legal_rights",
  "community_orgs",
  "education_careers",
  "health_services",
  "housing_support",
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export type ResourceDTO = {
  id: string;
  title: string;
  category: ResourceCategory;
  body: string;
  // Optional external link (NGO / hotline / org page), or null for an in-app
  // article/guide.
  url: string | null;
  // Whether it appears in the "Featured Resources" strip.
  featured: boolean;
  createdAt: string;
};

// Predefined crisis / safety contact categories (P-37, "Pomoc w kryzysie",
// assets/safety-page-*.png). Coarse SERVICE types for the safety page's filter
// chips — 🔒 deliberately never identity/orientation (Article-9-safe; a category
// can't infer sexual orientation; mirrors SAFE_PLACE_CATEGORIES). The Zod
// validator enums over this tuple. FROZEN — append, never rename. `emergency`
// leads the list (112) and drives the safety-page banner.
export const CRISIS_CONTACT_CATEGORIES = [
  "emergency",
  "emotional_crisis",
  "legal",
  "community",
] as const;

export type CrisisContactCategory = (typeof CRISIS_CONTACT_CATEGORIES)[number];

// A crisis/safety contact on the "Pomoc w kryzysie" page (P-37). Admin-curated,
// vetted, life-critical. Reads are public so it works signed-out. `verified`
// reflects an admin freshness stamp (backs the "Zweryfikowane" badge) — the raw
// verifiedAt timestamp stays server-side. `hours` null = availability unspecified.
// This is CONTENT, not user personal data.
export type CrisisContactDTO = {
  id: string;
  name: string;
  phone: string;
  description: string;
  hours: string | null;
  category: CrisisContactCategory;
  verified: boolean;
  createdAt: string;
};

// Predefined news categories (P-31, pillar-3 News; design refs
// assets/news-feed-*.png). Coarse editorial TOPICS for the feed's filter chips
// (Prawa / Społeczność / Zdrowie / Świat) — 🔒 deliberately never
// identity/orientation (Article-9-safe; a topic can't infer sexual orientation;
// mirrors RESOURCE_CATEGORIES). The Zod validator enums over this tuple. FROZEN —
// append, never rename.
export const NEWS_CATEGORIES = [
  "rights",
  "community",
  "health",
  "world",
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

// A news article (P-31). Admin-published editorial CONTENT (not user data). Two
// modes: our own editorial (a non-null `body`) and externally-sourced (a null
// `body` + a `sourceUrl` to read at the origin). `summary` is always the card
// blurb. `imageUrl` is a short-lived signed URL for the article image, or null —
// the raw R2 key is NEVER exposed (the admin upload + signing land in a later
// slice, so it is always null for now). `featured` backs the "NA TOPIE" top story.
export type NewsDTO = {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  category: NewsCategory;
  source: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  featured: boolean;
  createdAt: string;
};

export type NotificationPreferencesDTO = {
  communityPosts: boolean;
  events: boolean;
  eventReminders: boolean;
  communityInvites: boolean;
  memberJoins: boolean;
  // Note: moderation_action has no toggle — it is always delivered.
};

export type SubscriptionDTO = {
  status: SubscriptionStatus;
  productId: string | null;
  expiresAt: string | null;
};

export type AdDTO = {
  id: string;
  imageUrl: string | null;
  targetUrl: string | null;
  advertiser: string | null;
};

export type ReportDTO = {
  id: string;
  resourceType: ReportResourceType;
  resourceId: string;
  reason: string;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  createdAt: string;
};

// Admin-only report view — the public ReportDTO plus moderation internals (who
// reviewed it, when, and the resolution note). Returned ONLY by /api/admin/*
// moderation endpoints; the public surface and account export use ReportDTO so
// moderation internals never leak to the reporter.
export type AdminReportDTO = ReportDTO & {
  reviewedById: string | null;
  reviewedAt: string | null;
  resolution: string | null;
};

// PATCH /api/admin/reports/:id body — resolve or dismiss a queued report.
export type ResolveReportInput = {
  status: "resolved" | "dismissed";
  resolution?: string;
};

// POST /api/admin/moderation/remove-content body — post-only this slice
// (message removal lands with chat, Sprint 5).
export type RemoveContentInput = {
  resourceType: "post";
  resourceId: string;
};

// Admin-only user view (admin/moderation dashboard). Includes `email` (admins
// manage accounts) — NEVER returned on a public/self surface. `bannedAt` is the
// moderation suspension marker; `deletedAt` flags an erased account.
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

// POST /api/admin/moderation/ban|unban body.
export type BanUserInput = {
  userId: string;
};

// ── GDPR export (Art. 20 portability) ─────────────────────────────────────────

export type ConsentRecordDTO = {
  consentType: ConsentType;
  policyVersion: string;
  grantedAt: string;
  withdrawnAt: string | null;
};

// The user's complete portable record (Art. 20). Includes ALL non-secret user
// data we store. Soft-deleted posts/messages are included as-is (with whatever
// `content` holds, e.g. "[deleted]") and flagged via `deleted` — they're still
// the user's records. EXCLUDED by design (security/ops artifacts, not portable
// personal data): raw push tokens, password-reset token hashes, Supabase auth
// internals, and the audit_log. See docs/API.md §5.
export type AccountExport = {
  profile: AccountProfile;
  createdAt: string;
  communities: { id: string; name: string; joinedAt: string }[];
  posts: {
    id: string;
    communityId: string;
    content: string;
    createdAt: string;
    deleted: boolean;
  }[];
  messages: {
    id: string;
    communityId: string;
    content: string;
    createdAt: string;
    deleted: boolean;
  }[];
  events: { id: string; title: string; status: RsvpStatus }[];
  savedEvents: { id: string; title: string; savedAt: string }[];
  savedSafePlaces: { id: string; name: string; savedAt: string }[];
  consents: ConsentRecordDTO[];
  notificationPreferences: NotificationPreferencesDTO;
  blocks: { blockedUserId: string; createdAt: string }[];
  reports: ReportDTO[];
  subscription: SubscriptionDTO | null;
};
