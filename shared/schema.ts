// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA PENDING DPIA
//
// This schema MUST NOT be treated as final. The client (the data controller)
// must complete a Data Protection Impact Assessment before the schema is locked
// (COMPLIANCE_AND_PRIVACY.md §4). If the DPIA determines certain fields must not
// be collected — or that additional safeguards are required — those decisions
// change this file. Retrofitting is expensive; flag schema changes against the
// DPIA before adding any user-data field.
//
// Design rules enforced here (see COMPLIANCE_AND_PRIVACY.md):
//   • consent_records and audit_log exist from migration 1 (legal requirement).
//   • Every table with a users reference declares explicit ON DELETE behaviour.
//   • No GPS coordinates are stored as a USER preference — city-level text only.
//     (safe_places coordinates are admin-curated VENUE data, not user tracking.)
//   • Erasure is by anonymisation, not hard delete (§5.2): cascade is used only
//     where a row should disappear with its user (memberships, rsvps, tokens),
//     and SET NULL where content must survive with the author anonymised.
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  customType,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Postgres `inet` type for IP addresses (consent_records, audit_log). Drizzle
// has no built-in inet helper; this maps the column type faithfully.
const inet = customType<{ data: string }>({
  dataType() {
    return "inet";
  },
});

// ── users ───────────────────────────────────────────────────────────────────
// displayName is the PUBLIC alias (anonymity model) — never the real name.
// email is for account management/recovery only and is never shown to other
// users. isAdmin gates the admin/moderation dashboard. preferredCity is
// city-level only (no GPS — COMPLIANCE §5.8).
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  isPremium: boolean("is_premium").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  preferredCity: text("preferred_city"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Soft delete / anonymisation marker. isAuthenticated rejects non-null rows.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // Moderation suspension marker (admin ban). Non-null = banned: isAuthenticated
  // resolves the user but returns 403, while GDPR export/erasure stay reachable.
  // Cleared on erasure (a deleted account's ban state is moot).
  bannedAt: timestamp("banned_at", { withTimezone: true }),
});

// ── communities ───────────────────────────────────────────────────────────────
// createdById SET NULL: a community survives its creator's anonymisation.
export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── community_memberships ─────────────────────────────────────────────────────
// role is community-level (member | moderator | admin) — distinct from the
// platform-level users.isAdmin. Both FKs cascade: erasure deletes the row (§5.2).
export const communityMemberships = pgTable(
  "community_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueMembership: unique().on(t.communityId, t.userId),
    byUser: index("idx_memberships_user").on(t.userId),
  }),
);

// ── events ────────────────────────────────────────────────────────────────────
// location is free text (venue name/address). Pin coordinates for events are a
// DPIA-pending decision — not stored yet. createdById SET NULL on anonymisation.
// reminderSentAt is the idempotency marker for the slice-3 reminder cron: NULL =
// not sent. It has NO default so newly-created/existing rows read as not-yet-sent
// (a default of now() would wrongly mark every event as already reminded). The
// cron flips it via a guarded UPDATE ... WHERE reminder_sent_at IS NULL.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    imageUrl: text("image_url"),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Lifecycle: "active" (default) or "cancelled". A cancelled event keeps its
    // content (unlike a soft-deleted one, which is tombstoned) so RSVP'd users
    // still see WHAT was cancelled; cancelledAt marks when. The creator-cancel
    // path flips these via a guarded UPDATE ... WHERE status = 'active'.
    status: text("status").notNull().default("active"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    // Global upcoming-events feed: keyset-paginated on (startsAt, id).
    byStart: index("idx_events_starts_at").on(t.startsAt, t.id),
    // A single community's events, soonest-first.
    byCommunityStart: index("idx_events_community_start").on(
      t.communityId,
      t.startsAt,
    ),
  }),
);

// ── event_rsvps ───────────────────────────────────────────────────────────────
// Both FKs cascade: erasure deletes the row (§5.2).
export const eventRsvps = pgTable(
  "event_rsvps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("going"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueRsvp: unique().on(t.eventId, t.userId),
  }),
);

// ── posts ─────────────────────────────────────────────────────────────────────
// authorId SET NULL: on erasure the post is retained for community/thread
// integrity, content is replaced with "[deleted]", and the author is anonymised.
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  // Feed index for cursor pagination by community, newest-first, with id as the
  // keyset tie-breaker for the (createdAt, id) ordering.
  (t) => ({
    byCommunity: index("idx_posts_community").on(
      t.communityId,
      t.createdAt,
      t.id,
    ),
  }),
);

// ── messages ──────────────────────────────────────────────────────────────────
// Community chat. Stored in PLAINTEXT by design (Discord model) so moderation
// can act on reports — E2EE was rejected (COMPLIANCE §5.6). Delivery is via
// Supabase Realtime Broadcast; this table is the durable history/source of
// truth. senderId SET NULL on anonymisation; deletedAt marks "[deleted]".
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  // Feed index for cursor pagination by community, newest-first, with id as the
  // keyset tie-breaker for the (createdAt, id) ordering (mirrors idx_posts_community).
  (t) => ({
    byCommunity: index("idx_messages_community").on(
      t.communityId,
      t.createdAt,
      t.id,
    ),
  }),
);

// ── safe_places ───────────────────────────────────────────────────────────────
// Admin/editor-curated VENUE data (LGBT-friendly cafés, clubs, NGOs, services).
// Coordinates here describe a public venue, NOT a user's location — this is the
// one place coordinates are persisted (COMPLIANCE §5.8). createdById is the
// curating admin.
export const safePlaces = pgTable("safe_places", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  address: text("address"),
  city: text("city"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── reports ───────────────────────────────────────────────────────────────────
// Moderation queue. Reports are RETAINED for moderation audit; on erasure the
// reporter is anonymised (reporterId SET NULL — §5.2). resourceType + resourceId
// point at the reported content (post | message | user | event | community).
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// ── blocks ────────────────────────────────────────────────────────────────────
// Block/mute. Built from the start so it can be joined into content queries
// (TRANSFER §5.3). Both FKs cascade — a block disappears with either account.
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueBlock: unique().on(t.blockerId, t.blockedId),
  }),
);

// ── ad_campaigns ──────────────────────────────────────────────────────────────
// Admin-managed advertising (revenue model). Not user-generated. createdById is
// the managing admin.
export const adCampaigns = pgTable("ad_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  advertiser: text("advertiser"),
  imageUrl: text("image_url"),
  targetUrl: text("target_url"),
  status: text("status").notNull().default("draft"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ── consent_records ───────────────────────────────────────────────────────────
// LEGALLY MANDATORY from migration 1 (COMPLIANCE §5.1). Article 9(2)(a) explicit
// consent must be recorded per user, per purpose, per privacy-policy version.
// userId CASCADE: erasure deletes all rows (deletion itself is the record, §5.2).
// ip_address retained for audit — purge after 90 days (scheduled cleanup, §5.4).
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'account_creation' | 'marketing_emails' | 'analytics' | 'location_data'
    consentType: text("consent_type").notNull(),
    // Privacy-policy version consented to, e.g. '2026-08-20'. Re-consent on bump.
    policyVersion: text("policy_version").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // null = consent still active; set when the user withdraws consent.
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
  },
  (t) => ({
    byUser: index("idx_consent_records_user_id").on(t.userId),
    byTypeVersion: index("idx_consent_records_type_version").on(
      t.consentType,
      t.policyVersion,
    ),
  }),
);

// ── audit_log ─────────────────────────────────────────────────────────────────
// LEGALLY MANDATORY from migration 1 (COMPLIANCE §5.3). For breach
// investigation, regulatory response, and moderation accountability.
// actorId is intentionally NOT a foreign key: when an account is deleted the
// reference is anonymised (set to null) but the log entry is RETAINED. metadata
// must never contain PII, message content, or secrets.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"), // null for system actions or anonymised actors
    // Dot-notation: 'user.registered', 'user.deleted', 'moderation.user_banned'…
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata"),
    ipAddress: inet("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byActor: index("idx_audit_log_actor_id").on(t.actorId),
    byAction: index("idx_audit_log_action").on(t.action),
    byCreatedAt: index("idx_audit_log_created_at").on(t.createdAt),
  }),
);

// ── device_push_tokens ────────────────────────────────────────────────────────
// One row per device. Expo push tokens (Expo relays to FCM/APNs). userId CASCADE:
// erasure deletes all rows. token is unique; isActive is flipped off when Expo
// reports the token as stale (see server/notifications.ts).
export const devicePushTokens = pgTable("device_push_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(), // 'ios' | 'android' | 'web'
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── notification_preferences ──────────────────────────────────────────────────
// One row per user (userId is the PK). Boolean per notification type, default
// all-on. Column names match server/notifications.ts preferenceKey(). No column
// for moderation_action — it is always-on and cannot be disabled.
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  communityPosts: boolean("community_posts").notNull().default(true),
  events: boolean("events").notNull().default(true),
  eventReminders: boolean("event_reminders").notNull().default(true),
  communityInvites: boolean("community_invites").notNull().default(true),
  memberJoins: boolean("member_joins").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── subscriptions ─────────────────────────────────────────────────────────────
// Premium membership state, synced from RevenueCat webhooks. One row per user.
// userId CASCADE: erasure deletes the row.
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'active' | 'expired' | 'cancelled' | 'in_grace'
  productId: text("product_id"),
  store: text("store"), // 'app_store' | 'play_store'
  revenueCatCustomerId: text("revenuecat_customer_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── password_reset_tokens ─────────────────────────────────────────────────────
// Custom password-reset flow. Stores only a SHA-256 HASH of the reset token
// (never the raw token), an expiry, and a usedAt marker for single-use. userId
// CASCADE: tokens vanish with the account. The raw token only ever exists in the
// emailed link and the inbound reset request.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }), // null until consumed
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byHash: index("idx_password_reset_token_hash").on(t.tokenHash),
    byUser: index("idx_password_reset_user").on(t.userId),
  }),
);

// ── Inferred types ────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;
export type CommunityMembership = typeof communityMemberships.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type SafePlace = typeof safePlaces.$inferSelect;
export type NewSafePlace = typeof safePlaces.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type AdCampaign = typeof adCampaigns.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type NewConsentRecord = typeof consentRecords.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type DevicePushToken = typeof devicePushTokens.$inferSelect;
export type NotificationPreferences =
  typeof notificationPreferences.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
