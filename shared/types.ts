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
  | "community";
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
  rsvp: { status: RsvpStatus } | null; // caller's RSVP, if any
};

export type SafePlaceDTO = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  city: string | null;
  // Venue coordinates (admin-curated venue data, NOT user location — §5.8).
  latitude: number | null;
  longitude: number | null;
};

export type ResourceDTO = {
  id: string;
  title: string;
  category: string;
  body: string;
  createdAt: string;
};

export type EmergencyContact = {
  label: string;
  phone: string;
  description: string | null;
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
  consents: ConsentRecordDTO[];
  notificationPreferences: NotificationPreferencesDTO;
  blocks: { blockedUserId: string; createdAt: string }[];
  reports: ReportDTO[];
  subscription: SubscriptionDTO | null;
};
