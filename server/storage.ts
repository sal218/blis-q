import {
  eq,
  and,
  or,
  lt,
  inArray,
  notInArray,
  gt,
  gte,
  isNull,
  isNotNull,
  exists,
  asc,
  desc,
  count,
  ilike,
  sql,
  type SQL,
} from "drizzle-orm";
import type { MembershipRole, PublicUser } from "@shared/types";
import { db } from "./db";
import {
  users,
  notificationPreferences,
  devicePushTokens,
  communities,
  communityMemberships,
  posts,
  messages,
  events,
  eventRsvps,
  eventSaves,
  safePlaces,
  safePlaceSaves,
  resources,
  crisisContacts,
  news,
  adCampaigns,
  blocks,
  reports,
  subscriptions,
  consentRecords,
  auditLog,
  passwordResetTokens,
  type User,
  type NewUser,
} from "@shared/schema";
import { invalidateProfileCache } from "./auth";
import { likeEscape } from "./likeEscape";
import { MAX_SAFE_PLACE_MARKERS } from "./validation";

// Input for the transactional signup write (server/routes/auth.ts). `id` is the
// Supabase auth user id so users.id === the JWT `sub` the middleware resolves.
export type RegisterUserInput = {
  id: string;
  email: string;
  displayName: string;
  consentTypes: string[];
  policyVersion: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

// audit_log row input. metadata must never contain PII/secrets (COMPLIANCE §5.3).
export type AuditLogInput = {
  actorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

// The caller's own account (GET /profile, login response). Maps to AccountProfile
// in shared/types.ts after the route serialises createdAt to ISO.
export type AccountProfileRow = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  isAdmin: boolean;
  preferredCity: string | null;
  createdAt: Date;
  deletedAt: Date | null; // route uses this to block soft-deleted accounts
  bannedAt: Date | null; // route uses this to block suspended accounts at login
};

// The exact projection the auth middleware needs (server/auth.ts). Kept narrow
// so auth callers never receive columns they shouldn't — least data exposure.
export type AuthUserProfile = {
  id: string;
  email: string;
  displayName: string;
  isPremium: boolean;
  isAdmin: boolean;
  deletedAt: Date | null;
  bannedAt: Date | null;
};

// A user row projected for the admin/moderation dashboard (→ AdminUserDTO).
// Includes email (admins manage accounts); never used on a public/self surface.
export type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isPremium: boolean;
  createdAt: Date;
  bannedAt: Date | null;
  deletedAt: Date | null;
};

// A consent_records row projected for the account consents endpoint. The route
// serialises grantedAt/withdrawnAt to ISO strings (ConsentRecordDTO).
export type ConsentRecordRow = {
  consentType: string;
  policyVersion: string;
  grantedAt: Date;
  withdrawnAt: Date | null;
};

// Everything in a user's Art. 20 export, with raw Date fields (the route maps to
// AccountExport ISO strings). Soft-deleted posts/messages are INCLUDED (flagged
// via `deleted`). Excludes security/ops artifacts (push tokens, reset-token
// hashes, audit_log) by simply not reading them here.
export type AccountExportData = {
  profile: AccountProfileRow | null;
  consents: ConsentRecordRow[];
  notificationPreferences: NotificationPreferenceFlags;
  communities: { id: string; name: string; joinedAt: Date }[];
  posts: {
    id: string;
    communityId: string;
    content: string;
    createdAt: Date;
    deleted: boolean;
  }[];
  messages: {
    id: string;
    communityId: string;
    content: string;
    createdAt: Date;
    deleted: boolean;
  }[];
  events: { id: string; title: string; status: string }[];
  // Saved (bookmarked) events + safe places — private per-user preference data,
  // portable under Art. 20 (the label mirrors the export style: communities carry
  // `name`, events carry `title`). Erasure deletes these rows; the export lists
  // still-present resources the user has bookmarked.
  savedEvents: { id: string; title: string; savedAt: Date }[];
  savedSafePlaces: { id: string; name: string; savedAt: Date }[];
  blocks: { blockedUserId: string; createdAt: Date }[];
  reports: {
    id: string;
    resourceType: string;
    resourceId: string;
    reason: string;
    status: string;
    createdAt: Date;
  }[];
  subscription: {
    status: string;
    productId: string | null;
    expiresAt: Date | null;
  } | null;
};

// A community projected for the API, with the derived memberCount and the
// caller's own role (null if not a member). The route serialises createdAt to
// ISO → CommunityDTO.
export type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  createdAt: Date;
  memberCount: number;
  callerRole: MembershipRole | null;
};

// One post row joined with its author's public fields. The route masks deleted
// posts (content → "[deleted]", author → null) when building the DTO.
export type PostRow = {
  id: string;
  communityId: string;
  authorId: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  imageUrl: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

// One chat message row joined with its sender's public fields. The route masks
// deleted messages (content → "[deleted]", sender → null) when building the DTO.
export type MessageRow = {
  id: string;
  communityId: string;
  senderId: string | null;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: Date;
  deletedAt: Date | null;
};

// One row of the Messages inbox: a community the caller belongs to + role + the
// latest visible message (null if none). The route masks a deleted last message.
export type ChatSummaryRow = {
  communityId: string;
  communityName: string;
  communityImageUrl: string | null;
  role: MembershipRole;
  lastMessage: MessageRow | null;
};

// One event joined with two correlated aggregates: goingCount (attendees with
// status "going" — an aggregate, never identities) and callerRsvpStatus (the
// caller's own RSVP, or null). The route masks deleted events when building the
// DTO. createdById is exposed only for the block/authorization checks, never
// serialised.
export type EventRow = {
  id: string;
  communityId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  imageUrl: string | null;
  createdById: string | null;
  goingCount: number;
  callerRsvpStatus: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  status: string; // "active" | "cancelled" (DB text; route narrows to the union)
  cancelledAt: Date | null;
  callerSaved: boolean; // whether the caller has saved this event (private)
  category: string | null; // predefined event-type tag (DB text; route narrows)
};

// A safe-place venue row (admin-curated). `category` is DB text; the route
// narrows it to the SafePlaceCategory union for the DTO. latitude/longitude are
// venue coordinates (admin data, not user location — §5.8).
export type SafePlaceRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  // R2 object key for the venue photo (server-internal — the DTO exposes a
  // signed `imageUrl`, never this key).
  imageKey: string | null;
  // Raw accessibility-feature keys as stored (text[]). The DTO builders narrow
  // these to the known ACCESSIBILITY_FEATURES union.
  accessibilityFeatures: string[];
};

// A safe-place row on a USER read path, carrying the caller's private `saved`
// flag (an EXISTS subquery). Admin create/update paths keep the raw SafePlaceRow
// (no caller context), so this stays separate from safePlaceColumns().
export type SafePlaceReadRow = SafePlaceRow & { callerSaved: boolean };

// A resource row as returned by resourceColumns() (P-37). `category` is a DB text
// column; the route narrows it to the ResourceCategory union on the DTO.
export type ResourceRow = {
  id: string;
  title: string;
  category: string;
  body: string;
  url: string | null;
  featured: boolean;
  createdAt: Date;
};

// A news row as returned by newsColumns() (P-31). `category` is a DB text column;
// the route narrows it to the NewsCategory union on the DTO. `imageKey` is
// server-internal (the article photo's R2 key) — the route signs it into
// `imageUrl` and NEVER serialises the raw key. `body`/`sourceUrl` are nullable
// (the two content modes: editorial full body vs external + link).
export type NewsRow = {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  category: string;
  source: string;
  sourceUrl: string | null;
  imageKey: string | null;
  featured: boolean;
  createdAt: Date;
};

// A crisis-contact row as returned by crisisContactColumns() (P-37). `category`
// is a DB text column; the route narrows it to CrisisContactCategory on the DTO.
// `verifiedAt` is internal — the DTO exposes only a derived `verified` boolean.
export type CrisisContactRow = {
  id: string;
  name: string;
  phone: string;
  description: string;
  hours: string | null;
  category: string;
  verifiedAt: Date | null;
  createdAt: Date;
};

// One row of the admin reports queue. `status`/`resourceType` are DB text
// columns; the route narrows them to the DTO unions.
export type ReportRow = {
  id: string;
  resourceType: string;
  resourceId: string;
  reason: string;
  status: string;
  createdAt: Date;
};

// A report row with moderation fields, for the admin resolve/queue surface
// (→ AdminReportDTO). Never exposed on public/account-export surfaces.
export type ModeratedReportRow = ReportRow & {
  reviewedById: string | null;
  reviewedAt: Date | null;
  resolution: string | null;
};

// The boolean flags read by server/notifications.ts preferenceKey(). Returned
// even when a user has no notification_preferences row yet (defaults all-on).
export type NotificationPreferenceFlags = {
  communityPosts: boolean;
  events: boolean;
  eventReminders: boolean;
  communityInvites: boolean;
  memberJoins: boolean;
};

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceFlags = {
  communityPosts: true,
  events: true,
  eventReminders: true,
  communityInvites: true,
  memberJoins: true,
};

/**
 * Repository for all database access. Route handlers call these methods — they
 * never touch the Drizzle client directly (ENGINEERING_STANDARDS §7). Domain
 * methods (communities, events, posts, messages, reports, safe places, ad
 * campaigns) are added here per feature; this scaffold contains only what the
 * adapted infrastructure files already depend on, plus core user lookups.
 *
 * NOTE: every method that writes to the `users` table MUST call
 * invalidateProfileCache(userId) before returning (CLAUDE.md §8).
 */
export class DatabaseStorage {
  // ── Users ───────────────────────────────────────────────────────────────────

  // Returns only the auth-profile projection (not the full row), so auth
  // callers can't accidentally read columns they shouldn't.
  async getUser(userId: string): Promise<AuthUserProfile | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isPremium: users.isPremium,
        isAdmin: users.isAdmin,
        deletedAt: users.deletedAt,
        bannedAt: users.bannedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async createUser(data: NewUser): Promise<User> {
    const [row] = await db.insert(users).values(data).returning();
    // Rule: invalidate after EVERY write to users (CLAUDE.md §8). A fresh
    // insert has no cache entry yet, so this is a no-op del today, but the
    // rule is unconditional and future code may pre-warm the cache.
    await invalidateProfileCache(row.id);
    return row;
  }

  async updateUser(
    userId: string,
    data: Partial<NewUser>,
  ): Promise<User | null> {
    const [row] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    await invalidateProfileCache(userId);
    return row ?? null;
  }

  // ── Admin: users / moderation ───────────────────────────────────────────────

  // Admin user directory: one page, newest first, optional email/displayName
  // search and status filter (active = not banned, not deleted; banned = banned
  // and not deleted). Page query + one count query (no N+1).
  async adminListUsers(input: {
    offset: number;
    limit: number;
    search?: string;
    status?: "active" | "banned";
  }): Promise<{ rows: AdminUserRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [];
    if (input.search) {
      const term = `%${likeEscape(input.search)}%`;
      conditions.push(
        or(ilike(users.email, term), ilike(users.displayName, term)),
      );
    }
    if (input.status === "active") {
      conditions.push(isNull(users.bannedAt));
      conditions.push(isNull(users.deletedAt));
    } else if (input.status === "banned") {
      conditions.push(isNotNull(users.bannedAt));
      conditions.push(isNull(users.deletedAt));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(where);

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        isPremium: users.isPremium,
        createdAt: users.createdAt,
        bannedAt: users.bannedAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return { rows, total: Number(total) };
  }

  async adminGetUser(id: string): Promise<AdminUserRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        isPremium: users.isPremium,
        createdAt: users.createdAt,
        bannedAt: users.bannedAt,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  // Ban (suspend) a user. The guarded UPDATE makes it atomic and one-way: only a
  // live, not-already-banned account matches, so the audit row is written at most
  // once. No row matched ⇒ distinguish missing/deleted (not_found) from already
  // banned (already). MUST invalidateProfileCache so the 60s auth cache can't keep
  // serving the now-banned identity (CLAUDE.md §8). Audit references the user id
  // only — no free text.
  async banUser(
    userId: string,
    adminId: string,
    ipAddress?: string | null,
  ): Promise<"banned" | "not_found" | "already"> {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ bannedAt: new Date() })
        .where(
          and(
            eq(users.id, userId),
            isNull(users.deletedAt),
            isNull(users.bannedAt),
          ),
        )
        .returning({ id: users.id });
      if (!row) {
        const [existing] = await tx
          .select({ bannedAt: users.bannedAt, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!existing || existing.deletedAt) return "not_found" as const;
        return "already" as const;
      }
      await tx.insert(auditLog).values({
        actorId: adminId,
        action: "moderation.user_banned",
        resourceType: "user",
        resourceId: userId,
        ipAddress: ipAddress ?? null,
      });
      return "banned" as const;
    });
    if (result === "banned") await invalidateProfileCache(userId);
    return result;
  }

  // Unban a user. Guarded UPDATE: only a live, currently-banned account matches.
  async unbanUser(
    userId: string,
    adminId: string,
    ipAddress?: string | null,
  ): Promise<"unbanned" | "not_found" | "not_banned"> {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ bannedAt: null })
        .where(
          and(
            eq(users.id, userId),
            isNull(users.deletedAt),
            isNotNull(users.bannedAt),
          ),
        )
        .returning({ id: users.id });
      if (!row) {
        const [existing] = await tx
          .select({ deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!existing || existing.deletedAt) return "not_found" as const;
        return "not_banned" as const;
      }
      await tx.insert(auditLog).values({
        actorId: adminId,
        action: "moderation.user_unbanned",
        resourceType: "user",
        resourceId: userId,
        ipAddress: ipAddress ?? null,
      });
      return "unbanned" as const;
    });
    if (result === "unbanned") await invalidateProfileCache(userId);
    return result;
  }

  async getAccountProfile(userId: string): Promise<AccountProfileRow | null> {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        isPremium: users.isPremium,
        isAdmin: users.isAdmin,
        preferredCity: users.preferredCity,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        bannedAt: users.bannedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Atomically create a new user's local records: the users row (id = Supabase
   * auth user id), one consent_records row per consented purpose, default
   * notification_preferences, and a user.registered audit entry. If any insert
   * fails the whole transaction rolls back — the caller then deletes the
   * Supabase auth user so no orphaned account remains (COMPLIANCE §5.1/§5.2).
   */
  async registerUser(input: RegisterUserInput): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: input.id,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
      });

      await tx.insert(consentRecords).values(
        input.consentTypes.map((consentType) => ({
          userId: input.id,
          consentType,
          policyVersion: input.policyVersion,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        })),
      );

      await tx.insert(notificationPreferences).values({ userId: input.id });

      await tx.insert(auditLog).values({
        actorId: input.id,
        action: "user.registered",
        ipAddress: input.ipAddress ?? null,
      });
    });

    // New row, so nothing is cached yet — but the rule is unconditional.
    await invalidateProfileCache(input.id);
  }

  // A user's consent history (active + withdrawn), newest grant first. Maps to
  // ConsentRecordDTO in the route after serialising the timestamps.
  async getConsentRecords(userId: string): Promise<ConsentRecordRow[]> {
    return db
      .select({
        consentType: consentRecords.consentType,
        policyVersion: consentRecords.policyVersion,
        grantedAt: consentRecords.grantedAt,
        withdrawnAt: consentRecords.withdrawnAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.userId, userId))
      .orderBy(desc(consentRecords.grantedAt));
  }

  // Assembles a user's complete Art. 20 export (server/routes/account.ts maps it
  // to AccountExport). Every query is scoped to userId — a user only ever exports
  // their OWN data. Soft-deleted posts/messages are included (deleted = true).
  async getAccountExport(userId: string): Promise<AccountExportData> {
    const [profile, consents, notificationPreferences] = await Promise.all([
      this.getAccountProfile(userId),
      this.getConsentRecords(userId),
      this.getNotificationPreferences(userId),
    ]);

    const communityRows = await db
      .select({
        id: communities.id,
        name: communities.name,
        joinedAt: communityMemberships.joinedAt,
      })
      .from(communityMemberships)
      .innerJoin(
        communities,
        eq(communities.id, communityMemberships.communityId),
      )
      .where(eq(communityMemberships.userId, userId));

    const postRows = await db
      .select({
        id: posts.id,
        communityId: posts.communityId,
        content: posts.content,
        createdAt: posts.createdAt,
        deletedAt: posts.deletedAt,
      })
      .from(posts)
      .where(eq(posts.authorId, userId));

    const messageRows = await db
      .select({
        id: messages.id,
        communityId: messages.communityId,
        content: messages.content,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(eq(messages.senderId, userId));

    const eventRows = await db
      .select({
        id: events.id,
        title: events.title,
        status: eventRsvps.status,
      })
      .from(eventRsvps)
      .innerJoin(events, eq(events.id, eventRsvps.eventId))
      .where(eq(eventRsvps.userId, userId));

    const savedEventRows = await db
      .select({
        id: events.id,
        title: events.title,
        savedAt: eventSaves.createdAt,
      })
      .from(eventSaves)
      .innerJoin(events, eq(events.id, eventSaves.eventId))
      .where(eq(eventSaves.userId, userId))
      .orderBy(sql`${eventSaves.createdAt} desc`, sql`${events.id} asc`);

    const savedSafePlaceRows = await db
      .select({
        id: safePlaces.id,
        name: safePlaces.name,
        savedAt: safePlaceSaves.createdAt,
      })
      .from(safePlaceSaves)
      .innerJoin(safePlaces, eq(safePlaces.id, safePlaceSaves.safePlaceId))
      .where(eq(safePlaceSaves.userId, userId))
      .orderBy(
        sql`${safePlaceSaves.createdAt} desc`,
        sql`${safePlaces.id} asc`,
      );

    const blockRows = await db
      .select({
        blockedUserId: blocks.blockedId,
        createdAt: blocks.createdAt,
      })
      .from(blocks)
      .where(eq(blocks.blockerId, userId));

    const reportRows = await db
      .select({
        id: reports.id,
        resourceType: reports.resourceType,
        resourceId: reports.resourceId,
        reason: reports.reason,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId));

    const [subscription] = await db
      .select({
        status: subscriptions.status,
        productId: subscriptions.productId,
        expiresAt: subscriptions.expiresAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    return {
      profile,
      consents,
      notificationPreferences,
      communities: communityRows,
      posts: postRows.map((p) => ({
        id: p.id,
        communityId: p.communityId,
        content: p.content,
        createdAt: p.createdAt,
        deleted: p.deletedAt !== null,
      })),
      messages: messageRows.map((m) => ({
        id: m.id,
        communityId: m.communityId,
        content: m.content,
        createdAt: m.createdAt,
        deleted: m.deletedAt !== null,
      })),
      events: eventRows,
      savedEvents: savedEventRows,
      savedSafePlaces: savedSafePlaceRows,
      blocks: blockRows,
      reports: reportRows,
      subscription: subscription ?? null,
    };
  }

  async writeAuditLog(entry: AuditLogInput): Promise<void> {
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  }

  // ── Password reset tokens ─────────────────────────────────────────────────────

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await db.insert(passwordResetTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  }

  // Atomically consume a reset token: a SINGLE UPDATE that marks it used ONLY
  // if it is currently unused, unexpired, AND belongs to a live (non-deleted)
  // user. RETURNING yields the row only to the caller that won the race, so two
  // concurrent requests with the same token can never both succeed, and a
  // soft-deleted account's pre-issued token can never reset it.
  async consumePasswordResetToken(
    tokenHash: string,
  ): Promise<{ id: string; userId: string } | null> {
    const [row] = await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
          exists(
            db
              .select({ id: users.id })
              .from(users)
              .where(
                and(
                  eq(users.id, passwordResetTokens.userId),
                  isNull(users.deletedAt),
                ),
              ),
          ),
        ),
      )
      .returning({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      });
    return row ?? null;
  }

  // Invalidate any outstanding unused reset tokens for a user — called when a
  // new reset is requested, so at most one token is ever active per user.
  async invalidatePasswordResetTokensForUser(userId: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );
  }

  /**
   * GDPR Art. 17 erasure (COMPLIANCE §5.2, tracker P-2). ONE transaction that
   * anonymises the user across EVERY user-referencing table:
   *   • content (posts/messages) → "[deleted]" + media (posts.imageUrl) cleared,
   *     author/sender severed, and deletedAt set (consistent with the deleted
   *     contract the DTOs expose),
   *   • creator/reporter/reviewer FKs (communities, events, safe_places,
   *     ad_campaigns, reports) → null (those rows survive, de-linked),
   *   • relational/consent/token rows (memberships, RSVPs, blocks, consents,
   *     push tokens, notification prefs, subscriptions, reset tokens) → deleted,
   *   • audit_log: existing rows' actorId → null (rows RETAINED), then a
   *     `user.deleted` entry with NO user identifier anywhere (actorId/
   *     resourceId/metadata all null — never leak the erased uuid),
   *   • the users row itself is ANONYMISED in place (PII scrubbed, deletedAt set)
   *     — NOT hard-deleted, so the deletedAt blocking checks keep working.
   * Then invalidateProfileCache. Cross-system Supabase cleanup (session revoke +
   * auth-user delete) happens in the route AFTER this commits (DB-first).
   */
  async eraseUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Content → scrub text + media, sever the personal link, mark deleted.
      const now = new Date();
      await tx
        .update(posts)
        .set({
          content: "[deleted]",
          imageUrl: null,
          authorId: null,
          deletedAt: now,
        })
        .where(eq(posts.authorId, userId));
      await tx
        .update(messages)
        .set({ content: "[deleted]", senderId: null, deletedAt: now })
        .where(eq(messages.senderId, userId));

      // Creator / reporter / reviewer FKs → null (rows survive, de-linked).
      await tx
        .update(communities)
        .set({ createdById: null })
        .where(eq(communities.createdById, userId));
      await tx
        .update(events)
        .set({ createdById: null })
        .where(eq(events.createdById, userId));
      await tx
        .update(safePlaces)
        .set({ createdById: null })
        .where(eq(safePlaces.createdById, userId));
      await tx
        .update(resources)
        .set({ createdById: null })
        .where(eq(resources.createdById, userId));
      await tx
        .update(crisisContacts)
        .set({ createdById: null })
        .where(eq(crisisContacts.createdById, userId));
      await tx
        .update(news)
        .set({ createdById: null })
        .where(eq(news.createdById, userId));
      await tx
        .update(adCampaigns)
        .set({ createdById: null })
        .where(eq(adCampaigns.createdById, userId));
      await tx
        .update(reports)
        .set({ reporterId: null })
        .where(eq(reports.reporterId, userId));
      await tx
        .update(reports)
        .set({ reviewedById: null })
        .where(eq(reports.reviewedById, userId));

      // Relational / consent / token rows → delete.
      await tx
        .delete(communityMemberships)
        .where(eq(communityMemberships.userId, userId));
      await tx.delete(eventRsvps).where(eq(eventRsvps.userId, userId));
      // Saved bookmarks (events + safe places) → delete. The users row is
      // anonymised IN PLACE below (not hard-deleted), so the FK ON DELETE
      // CASCADE never fires — these must be removed explicitly (§5.2).
      await tx.delete(eventSaves).where(eq(eventSaves.userId, userId));
      await tx.delete(safePlaceSaves).where(eq(safePlaceSaves.userId, userId));
      await tx.delete(blocks).where(eq(blocks.blockerId, userId));
      await tx.delete(blocks).where(eq(blocks.blockedId, userId));
      await tx.delete(consentRecords).where(eq(consentRecords.userId, userId));
      await tx
        .delete(devicePushTokens)
        .where(eq(devicePushTokens.userId, userId));
      await tx
        .delete(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
      await tx
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId));

      // Audit: anonymise the actor on existing rows, RETAIN the rows.
      await tx
        .update(auditLog)
        .set({ actorId: null })
        .where(eq(auditLog.actorId, userId));

      // Audit: also anonymise user-targeted rows (e.g. moderation.user_banned),
      // where the erased user's UUID sits in resourceId. RETAIN the rows.
      await tx
        .update(auditLog)
        .set({ resourceId: null })
        .where(
          and(
            eq(auditLog.resourceType, "user"),
            eq(auditLog.resourceId, userId),
          ),
        );

      // Anonymise the users row in place (NOT a hard delete). bannedAt is
      // cleared — a deleted (erased) account's moderation state is moot.
      await tx
        .update(users)
        .set({
          email: `deleted-${userId}@deleted.invalid`,
          displayName: "[deleted]",
          avatarUrl: null,
          preferredCity: null,
          isPremium: false,
          isAdmin: false,
          bannedAt: null,
          deletedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Erasure audit entry — carries NO identifier of the erased user.
      await tx.insert(auditLog).values({ action: "user.deleted" });
    });

    await invalidateProfileCache(userId);
  }

  // ── Notification preferences ──────────────────────────────────────────────────

  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferenceFlags> {
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;

    return {
      communityPosts: row.communityPosts,
      events: row.events,
      eventReminders: row.eventReminders,
      communityInvites: row.communityInvites,
      memberJoins: row.memberJoins,
    };
  }

  // ── Push tokens ───────────────────────────────────────────────────────────────

  async getActiveTokensForUser(userId: string): Promise<{ token: string }[]> {
    return db
      .select({ token: devicePushTokens.token })
      .from(devicePushTokens)
      .where(
        and(
          eq(devicePushTokens.userId, userId),
          eq(devicePushTokens.isActive, true),
        ),
      );
  }

  async deactivatePushTokensByList(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await db
      .update(devicePushTokens)
      .set({ isActive: false })
      .where(inArray(devicePushTokens.token, tokens));
  }

  // ── Communities ───────────────────────────────────────────────────────────

  // Create a community and make the creator its admin, atomically (COMPLIANCE:
  // community creation is audited). Returns the new community projected for the
  // API (memberCount = 1, caller is admin).
  async createCommunity(input: {
    name: string;
    description?: string | null;
    creatorId: string;
    ipAddress?: string | null;
  }): Promise<CommunityRow> {
    const community = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(communities)
        .values({
          name: input.name,
          description: input.description ?? null,
          createdById: input.creatorId,
        })
        .returning();

      await tx.insert(communityMemberships).values({
        communityId: row.id,
        userId: input.creatorId,
        role: "admin",
      });

      await tx.insert(auditLog).values({
        actorId: input.creatorId,
        action: "community.created",
        resourceType: "community",
        resourceId: row.id,
        ipAddress: input.ipAddress ?? null,
      });

      return row;
    });

    return {
      id: community.id,
      name: community.name,
      description: community.description,
      imageUrl: community.imageUrl,
      createdAt: community.createdAt,
      memberCount: 1,
      callerRole: "admin",
    };
  }

  // One page of non-deleted communities (newest first), optional name search,
  // each with its memberCount and the caller's role (null if not a member).
  async listCommunities(input: {
    offset: number;
    limit: number;
    search?: string;
    callerId: string;
  }): Promise<{ rows: CommunityRow[]; total: number }> {
    const where = and(
      isNull(communities.deletedAt),
      input.search
        ? ilike(communities.name, `%${likeEscape(input.search)}%`)
        : undefined,
    );

    const [{ total }] = await db
      .select({ total: count() })
      .from(communities)
      .where(where);

    const page = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        imageUrl: communities.imageUrl,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(where)
      .orderBy(desc(communities.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    if (page.length === 0) return { rows: [], total: Number(total) };

    const ids = page.map((c) => c.id);
    const counts = await db
      .select({ communityId: communityMemberships.communityId, n: count() })
      .from(communityMemberships)
      .where(inArray(communityMemberships.communityId, ids))
      .groupBy(communityMemberships.communityId);
    const countMap = new Map(counts.map((c) => [c.communityId, Number(c.n)]));

    const mine = await db
      .select({
        communityId: communityMemberships.communityId,
        role: communityMemberships.role,
      })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.userId, input.callerId),
          inArray(communityMemberships.communityId, ids),
        ),
      );
    const roleMap = new Map(
      mine.map((m) => [m.communityId, m.role as MembershipRole]),
    );

    const rows: CommunityRow[] = page.map((c) => ({
      ...c,
      memberCount: countMap.get(c.id) ?? 0,
      callerRole: roleMap.get(c.id) ?? null,
    }));
    return { rows, total: Number(total) };
  }

  async getCommunity(
    id: string,
    callerId: string,
  ): Promise<CommunityRow | null> {
    const [community] = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        imageUrl: communities.imageUrl,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(and(eq(communities.id, id), isNull(communities.deletedAt)))
      .limit(1);
    if (!community) return null;

    const [{ n }] = await db
      .select({ n: count() })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, id));
    const [mine] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, id),
          eq(communityMemberships.userId, callerId),
        ),
      )
      .limit(1);

    return {
      ...community,
      memberCount: Number(n),
      callerRole: (mine?.role as MembershipRole) ?? null,
    };
  }

  // ── Admin community management (docs/API.md §14) ────────────────────────────

  // Admin community list: one page of NON-deleted communities (newest first),
  // optional name search, each with memberCount. No caller-role scoping (admin
  // view). Member counts come from one grouped query — no per-row N+1.
  async adminListCommunities(input: {
    offset: number;
    limit: number;
    search?: string;
  }): Promise<{ rows: CommunityRow[]; total: number }> {
    const where = and(
      isNull(communities.deletedAt),
      input.search
        ? ilike(communities.name, `%${likeEscape(input.search)}%`)
        : undefined,
    );

    const [{ total }] = await db
      .select({ total: count() })
      .from(communities)
      .where(where);

    const page = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        imageUrl: communities.imageUrl,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(where)
      .orderBy(desc(communities.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    if (page.length === 0) return { rows: [], total: Number(total) };

    const ids = page.map((c) => c.id);
    const counts = await db
      .select({ communityId: communityMemberships.communityId, n: count() })
      .from(communityMemberships)
      .where(inArray(communityMemberships.communityId, ids))
      .groupBy(communityMemberships.communityId);
    const countMap = new Map(counts.map((c) => [c.communityId, Number(c.n)]));

    const rows: CommunityRow[] = page.map((c) => ({
      ...c,
      memberCount: countMap.get(c.id) ?? 0,
      callerRole: null,
    }));
    return { rows, total: Number(total) };
  }

  // Admin get: a single NON-deleted community + memberCount (no caller role).
  async adminGetCommunity(id: string): Promise<CommunityRow | null> {
    const [community] = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        imageUrl: communities.imageUrl,
        createdAt: communities.createdAt,
      })
      .from(communities)
      .where(and(eq(communities.id, id), isNull(communities.deletedAt)))
      .limit(1);
    if (!community) return null;

    const [{ n }] = await db
      .select({ n: count() })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, id));
    return { ...community, memberCount: Number(n), callerRole: null };
  }

  // Update a non-deleted community (admin). Returns the updated row (+ member
  // count) or null if missing/deleted. Audited community.updated. Callers pass
  // already-trimmed, validated fields; at least one field is present.
  async updateCommunity(
    id: string,
    input: { name?: string; description?: string },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<CommunityRow | null> {
    const fields: { name?: string; description?: string } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.description !== undefined) fields.description = input.description;

    // The update + mandatory audit row must commit together (§7): a community
    // mutation must never persist without its audit entry.
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(communities)
        .set(fields)
        .where(and(eq(communities.id, id), isNull(communities.deletedAt)))
        .returning({
          id: communities.id,
          name: communities.name,
          description: communities.description,
          imageUrl: communities.imageUrl,
          createdAt: communities.createdAt,
        });
      if (!updated) return null;

      await tx.insert(auditLog).values({
        actorId,
        action: "community.updated",
        resourceType: "community",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return updated;
    });
    if (!row) return null;

    const [{ n }] = await db
      .select({ n: count() })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, id));
    return { ...row, memberCount: Number(n), callerRole: null };
  }

  // Soft-delete a community (admin) — sets deletedAt so it disappears from the
  // public list/detail/join. Audited community.deleted. Returns "not_found" if
  // it's missing or already deleted (idempotent-safe).
  async softDeleteCommunity(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found"> {
    // Soft-delete + mandatory audit row commit together (§7).
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(communities)
        .set({ deletedAt: new Date() })
        .where(and(eq(communities.id, id), isNull(communities.deletedAt)))
        .returning({ id: communities.id });
      if (!row) return "not_found";

      await tx.insert(auditLog).values({
        actorId,
        action: "community.deleted",
        resourceType: "community",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // Join: idempotent at the DB via onConflictDoNothing on the unique
  // (communityId, userId) constraint. Returns "already" when the membership
  // existed (route → 409), "not_found" for a missing/deleted community.
  async joinCommunity(
    communityId: string,
    userId: string,
    ipAddress?: string | null,
  ): Promise<"joined" | "already" | "not_found"> {
    const [community] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(
        and(eq(communities.id, communityId), isNull(communities.deletedAt)),
      )
      .limit(1);
    if (!community) return "not_found";

    // Mutation + mandatory audit commit together (§7). The onConflict returning
    // is inside the tx so the audit is written ONLY when a row was created.
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(communityMemberships)
        .values({ communityId, userId, role: "member" })
        .onConflictDoNothing()
        .returning({ id: communityMemberships.id });
      if (!row) return "already";

      await tx.insert(auditLog).values({
        actorId: userId,
        action: "community.member_joined",
        resourceType: "community",
        resourceId: communityId,
        ipAddress: ipAddress ?? null,
      });
      return "joined";
    });
  }

  // Leave: removes the caller's membership. Idempotent ("not_member" when there
  // was nothing to remove). INVARIANT: a community must always keep at least one
  // admin — the sole admin cannot leave ("last_admin" → route 409); they must
  // hand off the role first (role management lands in a later slice). (A rare
  // race where two admins leave simultaneously could still drop the count to 0;
  // stronger row-locking is deferred with role management.)
  async leaveCommunity(
    communityId: string,
    userId: string,
    ipAddress?: string | null,
  ): Promise<"left" | "not_member" | "not_found" | "last_admin"> {
    const [community] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(
        and(eq(communities.id, communityId), isNull(communities.deletedAt)),
      )
      .limit(1);
    if (!community) return "not_found";

    const [membership] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) return "not_member";

    if (membership.role === "admin") {
      const [{ admins }] = await db
        .select({ admins: count() })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.role, "admin"),
          ),
        );
      if (Number(admins) <= 1) return "last_admin";
    }

    // Mutation + audit commit together (§7); returning() so a concurrent leave
    // (row already gone) writes no phantom audit → "not_member".
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.userId, userId),
          ),
        )
        .returning({ id: communityMemberships.id });
      if (removed.length === 0) return "not_member";

      await tx.insert(auditLog).values({
        actorId: userId,
        action: "community.member_left",
        resourceType: "community",
        resourceId: communityId,
        ipAddress: ipAddress ?? null,
      });
      return "left";
    });
  }

  // ── Blocks & reports (user-facing safety primitives) ─────────────────────────

  // Block another user. Idempotent at the DB via onConflictDoNothing on the
  // unique (blockerId, blockedId) constraint: "created" on a fresh block (route
  // 201, audited), "already" when it existed (route 200, no new audit),
  // "not_found" when the target user doesn't exist. Self-block is rejected by
  // the route before this is called. Block is one-directional by the contract —
  // there is NO mute model (deferred, DPIA-gated schema change).
  async blockUser(
    blockerId: string,
    blockedId: string,
    ipAddress?: string | null,
  ): Promise<"created" | "already" | "not_found"> {
    // A soft-deleted / anonymised user is unavailable — not blockable (404).
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, blockedId), isNull(users.deletedAt)))
      .limit(1);
    if (!target) return "not_found";

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(blocks)
        .values({ blockerId, blockedId })
        .onConflictDoNothing()
        .returning({ id: blocks.id });
      if (!row) return "already";

      await tx.insert(auditLog).values({
        actorId: blockerId,
        action: "user.blocked",
        resourceType: "user",
        resourceId: blockedId,
        ipAddress: ipAddress ?? null,
      });
      return "created";
    });
  }

  // Unblock. Idempotent: "removed" when a block existed (audited), "not_blocked"
  // otherwise. Both map to 200 in the route.
  async unblockUser(
    blockerId: string,
    blockedId: string,
    ipAddress?: string | null,
  ): Promise<"removed" | "not_blocked"> {
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(blocks)
        .where(
          and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
        )
        .returning({ id: blocks.id });
      if (removed.length === 0) return "not_blocked";

      await tx.insert(auditLog).values({
        actorId: blockerId,
        action: "user.unblocked",
        resourceType: "user",
        resourceId: blockedId,
        ipAddress: ipAddress ?? null,
      });
      return "removed";
    });
  }

  // The users the caller has blocked, as PublicUser (never emails), newest first.
  // Soft-deleted/anonymised users are excluded.
  async listBlocks(blockerId: string): Promise<PublicUser[]> {
    return db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(and(eq(blocks.blockerId, blockerId), isNull(users.deletedAt)))
      .orderBy(desc(blocks.createdAt));
  }

  // ── Posts (docs/API.md §8) ──────────────────────────────────────────────────

  // IDs of users the caller has blocked — used to hide their content from feeds.
  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const rows = await db
      .select({ id: blocks.blockedId })
      .from(blocks)
      .where(eq(blocks.blockerId, blockerId));
    return rows.map((r) => r.id);
  }

  // True if a non-deleted community with this id exists.
  async communityExists(id: string): Promise<boolean> {
    const [row] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(and(eq(communities.id, id), isNull(communities.deletedAt)))
      .limit(1);
    return !!row;
  }

  // Create a post. Requires a non-deleted community AND author membership (POST
  // is member-gated). Insert + post.created audit commit together (§7).
  async createPost(
    communityId: string,
    authorId: string,
    content: string,
    ipAddress?: string | null,
  ): Promise<
    | { status: "created"; post: PostRow }
    | { status: "not_found" }
    | { status: "forbidden" }
  > {
    if (!(await this.communityExists(communityId))) {
      return { status: "not_found" };
    }
    const [membership] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, authorId),
        ),
      )
      .limit(1);
    if (!membership) return { status: "forbidden" };

    const row = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(posts)
        .values({ communityId, authorId, content })
        .returning({
          id: posts.id,
          communityId: posts.communityId,
          authorId: posts.authorId,
          content: posts.content,
          imageUrl: posts.imageUrl,
          createdAt: posts.createdAt,
          deletedAt: posts.deletedAt,
        });
      await tx.insert(auditLog).values({
        actorId: authorId,
        action: "post.created",
        resourceType: "post",
        resourceId: inserted.id,
        ipAddress: ipAddress ?? null,
      });
      return inserted;
    });

    const [author] = await db
      .select({
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    return {
      status: "created",
      post: {
        ...row,
        authorDisplayName: author?.displayName ?? null,
        authorAvatarUrl: author?.avatarUrl ?? null,
      },
    };
  }

  // One page of a community's posts, newest-first, keyset-paginated on
  // (createdAt, id). Hides posts authored by users the caller has blocked.
  // Deleted posts are returned as-is (the route masks them). Returns the rows
  // plus the next opaque cursor (or null at the end).
  async listPosts(input: {
    communityId: string;
    callerId: string;
    limit: number;
    cursor?: { createdAt: Date; id: string } | null;
  }): Promise<{
    rows: PostRow[];
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    const blockedIds = await this.getBlockedUserIds(input.callerId);

    const conditions: (SQL | undefined)[] = [
      eq(posts.communityId, input.communityId),
    ];
    if (blockedIds.length) {
      // authorId IS NULL (anonymised) is never "blocked".
      conditions.push(
        or(isNull(posts.authorId), notInArray(posts.authorId, blockedIds)),
      );
    }
    if (input.cursor) {
      conditions.push(
        or(
          lt(posts.createdAt, input.cursor.createdAt),
          and(
            eq(posts.createdAt, input.cursor.createdAt),
            lt(posts.id, input.cursor.id),
          ),
        ),
      );
    }

    const rows = await db
      .select({
        id: posts.id,
        communityId: posts.communityId,
        authorId: posts.authorId,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        content: posts.content,
        imageUrl: posts.imageUrl,
        createdAt: posts.createdAt,
        deletedAt: posts.deletedAt,
      })
      .from(posts)
      .leftJoin(users, eq(users.id, posts.authorId))
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
    return { rows: page, nextCursor };
  }

  // A single post (incl. its deletedAt so the caller can mask/gate). Returns null
  // when missing, in a deleted community, or authored by someone the caller has
  // blocked (so the route answers 404 for hidden posts).
  async getPost(id: string, callerId: string): Promise<PostRow | null> {
    const [row] = await db
      .select({
        id: posts.id,
        communityId: posts.communityId,
        authorId: posts.authorId,
        authorDisplayName: users.displayName,
        authorAvatarUrl: users.avatarUrl,
        content: posts.content,
        imageUrl: posts.imageUrl,
        createdAt: posts.createdAt,
        deletedAt: posts.deletedAt,
      })
      .from(posts)
      .leftJoin(users, eq(users.id, posts.authorId))
      .innerJoin(
        communities,
        and(
          eq(communities.id, posts.communityId),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(posts.id, id))
      .limit(1);
    if (!row) return null;

    if (row.authorId) {
      const blockedIds = await this.getBlockedUserIds(callerId);
      if (blockedIds.includes(row.authorId)) return null;
    }
    return row;
  }

  // Soft-delete a post (author OR a community mod/admin). deletedAt + post.deleted
  // audit commit together (§7). The route masks content in the response.
  async softDeletePost(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found" | "forbidden"> {
    const [post] = await db
      .select({
        communityId: posts.communityId,
        authorId: posts.authorId,
        deletedAt: posts.deletedAt,
      })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);
    if (!post || post.deletedAt) return "not_found";

    let authorized = post.authorId === actorId;
    if (!authorized) {
      const [m] = await db
        .select({ role: communityMemberships.role })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, post.communityId),
            eq(communityMemberships.userId, actorId),
          ),
        )
        .limit(1);
      authorized = m?.role === "moderator" || m?.role === "admin";
    }
    if (!authorized) return "forbidden";

    await db.transaction(async (tx) => {
      // Scrub stored content/media (not only mask the DTO) — API §8.
      await tx
        .update(posts)
        .set({ content: "[deleted]", imageUrl: null, deletedAt: new Date() })
        .where(eq(posts.id, id));
      await tx.insert(auditLog).values({
        actorId,
        action: "post.deleted",
        resourceType: "post",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
    });
    return "deleted";
  }

  // Insert a user-submitted report into the moderation queue (status defaults to
  // "pending"). The audit entry references the report record only — never the
  // free-text reason (which may contain PII) — so it can't leak content.
  // Moderation actions (resolve/dismiss/ban/remove) are a separate admin path.
  async submitReport(
    reporterId: string,
    input: { resourceType: string; resourceId: string; reason: string },
    ipAddress?: string | null,
  ): Promise<void> {
    // The report insert + its audit row commit together (§7).
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(reports)
        .values({
          reporterId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          reason: input.reason,
        })
        .returning({ id: reports.id });

      await tx.insert(auditLog).values({
        actorId: reporterId,
        action: "report.submitted",
        resourceType: "report",
        resourceId: row.id,
        ipAddress: ipAddress ?? null,
      });
    });
  }

  // ── Community chat messages (docs/API.md §9) ────────────────────────────────

  // True if the user is a member of the (non-deleted) community. Used to gate
  // chat read + report (chat is the in-group conversation, stricter than posts).
  async isCommunityMember(
    communityId: string,
    userId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ userId: communityMemberships.userId })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, userId),
        ),
      )
      .limit(1);
    return !!row;
  }

  // Persist a chat message. Requires a non-deleted community AND sender
  // membership (send is member-gated). NOT audited per-message (chat is
  // high-volume; only message.deleted + report.submitted are audited). The
  // route broadcasts the DTO post-commit, best-effort.
  async createMessage(
    communityId: string,
    senderId: string,
    content: string,
  ): Promise<
    | { status: "created"; message: MessageRow }
    | { status: "not_found" }
    | { status: "forbidden" }
  > {
    if (!(await this.communityExists(communityId))) {
      return { status: "not_found" };
    }
    if (!(await this.isCommunityMember(communityId, senderId))) {
      return { status: "forbidden" };
    }

    const [inserted] = await db
      .insert(messages)
      .values({ communityId, senderId, content })
      .returning({
        id: messages.id,
        communityId: messages.communityId,
        senderId: messages.senderId,
        content: messages.content,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      });

    const [sender] = await db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    return {
      status: "created",
      message: {
        ...inserted,
        senderDisplayName: sender?.displayName ?? null,
        senderAvatarUrl: sender?.avatarUrl ?? null,
      },
    };
  }

  // One page of a community's chat, newest-first, keyset-paginated on
  // (createdAt, id). Hides messages from users the caller has blocked. Deleted
  // messages are returned as-is (the route masks them).
  async listMessages(input: {
    communityId: string;
    callerId: string;
    limit: number;
    cursor?: { createdAt: Date; id: string } | null;
  }): Promise<{
    rows: MessageRow[];
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    const blockedIds = await this.getBlockedUserIds(input.callerId);

    const conditions: (SQL | undefined)[] = [
      eq(messages.communityId, input.communityId),
    ];
    if (blockedIds.length) {
      // senderId IS NULL (anonymised) is never "blocked".
      conditions.push(
        or(
          isNull(messages.senderId),
          notInArray(messages.senderId, blockedIds),
        ),
      );
    }
    if (input.cursor) {
      conditions.push(
        or(
          lt(messages.createdAt, input.cursor.createdAt),
          and(
            eq(messages.createdAt, input.cursor.createdAt),
            lt(messages.id, input.cursor.id),
          ),
        ),
      );
    }

    const rows = await db
      .select({
        id: messages.id,
        communityId: messages.communityId,
        senderId: messages.senderId,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
        content: messages.content,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;
    return { rows: page, nextCursor };
  }

  // A single message (incl. its deletedAt so the caller can mask/gate). Returns
  // null when missing, in a deleted community, or sent by someone the caller has
  // blocked (so the route answers 404 for hidden messages). Used by report.
  async getMessage(id: string, callerId: string): Promise<MessageRow | null> {
    const [row] = await db
      .select({
        id: messages.id,
        communityId: messages.communityId,
        senderId: messages.senderId,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
        content: messages.content,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.senderId))
      .innerJoin(
        communities,
        and(
          eq(communities.id, messages.communityId),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(messages.id, id))
      .limit(1);
    if (!row) return null;

    if (row.senderId) {
      const blockedIds = await this.getBlockedUserIds(callerId);
      if (blockedIds.includes(row.senderId)) return null;
    }
    return row;
  }

  // Soft-delete a chat message (sender OR a community mod/admin). The guarded
  // UPDATE (`deletedAt IS NULL`) makes it atomic — a concurrent delete can't
  // match twice, so the message.deleted audit is written at most once (§7). The
  // route masks content in the response.
  async softDeleteMessage(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found" | "forbidden"> {
    const [message] = await db
      .select({
        communityId: messages.communityId,
        senderId: messages.senderId,
        deletedAt: messages.deletedAt,
      })
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    if (!message || message.deletedAt) return "not_found";

    let authorized = message.senderId === actorId;
    if (!authorized) {
      const [m] = await db
        .select({ role: communityMemberships.role })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, message.communityId),
            eq(communityMemberships.userId, actorId),
          ),
        )
        .limit(1);
      authorized = m?.role === "moderator" || m?.role === "admin";
    }
    if (!authorized) return "forbidden";

    return db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(messages)
        .set({ content: "[deleted]", deletedAt: new Date() })
        .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
        .returning({ id: messages.id });
      // Lost the race to a concurrent delete ⇒ already gone.
      if (!deleted) return "not_found";

      await tx.insert(auditLog).values({
        actorId,
        action: "message.deleted",
        resourceType: "message",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // The caller's Messages inbox: every community they belong to (non-deleted) +
  // their role + the latest VISIBLE message as a preview. "Visible" = the latest
  // message whose sender the caller hasn't blocked (sender NULL never blocked) —
  // consistent with listMessages/getMessage. Deleted messages are returned as-is
  // (the route masks them). Ordered by most-recent activity; messageless
  // communities last. Scoped entirely to userId. NOT the browse list — this joins
  // memberships directly so it enumerates ALL joined chats.
  async listUserChats(userId: string): Promise<ChatSummaryRow[]> {
    const mine = await db
      .select({
        communityId: communities.id,
        communityName: communities.name,
        communityImageUrl: communities.imageUrl,
        role: communityMemberships.role,
      })
      .from(communityMemberships)
      .innerJoin(
        communities,
        and(
          eq(communities.id, communityMemberships.communityId),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(communityMemberships.userId, userId));
    if (mine.length === 0) return [];

    const ids = mine.map((c) => c.communityId);
    const blockedIds = await this.getBlockedUserIds(userId);

    // Latest block-filtered message per community via a row_number() window, then
    // keep rn = 1 (a subquery so we can window-rank then filter — Postgres can't
    // DISTINCT ON + reorder by activity in one pass).
    const conditions: (SQL | undefined)[] = [
      inArray(messages.communityId, ids),
    ];
    if (blockedIds.length) {
      conditions.push(
        or(
          isNull(messages.senderId),
          notInArray(messages.senderId, blockedIds),
        ),
      );
    }
    const ranked = db
      .select({
        id: messages.id,
        communityId: messages.communityId,
        senderId: messages.senderId,
        content: messages.content,
        createdAt: messages.createdAt,
        deletedAt: messages.deletedAt,
        rn: sql<number>`row_number() over (partition by ${messages.communityId} order by ${messages.createdAt} desc, ${messages.id} desc)`.as(
          "rn",
        ),
      })
      .from(messages)
      .where(and(...conditions))
      .as("ranked");

    const lasts = await db
      .select({
        id: ranked.id,
        communityId: ranked.communityId,
        senderId: ranked.senderId,
        content: ranked.content,
        createdAt: ranked.createdAt,
        deletedAt: ranked.deletedAt,
        senderDisplayName: users.displayName,
        senderAvatarUrl: users.avatarUrl,
      })
      .from(ranked)
      .leftJoin(users, eq(users.id, ranked.senderId))
      .where(eq(ranked.rn, 1));

    const lastByCommunity = new Map<string, MessageRow>();
    for (const m of lasts) {
      lastByCommunity.set(m.communityId, {
        id: m.id,
        communityId: m.communityId,
        senderId: m.senderId,
        senderDisplayName: m.senderDisplayName ?? null,
        senderAvatarUrl: m.senderAvatarUrl ?? null,
        content: m.content,
        createdAt: m.createdAt,
        deletedAt: m.deletedAt,
      });
    }

    const rows: ChatSummaryRow[] = mine.map((c) => ({
      communityId: c.communityId,
      communityName: c.communityName,
      communityImageUrl: c.communityImageUrl,
      role: c.role as MembershipRole,
      lastMessage: lastByCommunity.get(c.communityId) ?? null,
    }));

    // Most-recent activity first; communities with no messages last (by name).
    rows.sort((a, b) => {
      const at = a.lastMessage?.createdAt.getTime() ?? -Infinity;
      const bt = b.lastMessage?.createdAt.getTime() ?? -Infinity;
      if (at !== bt) return bt - at;
      return a.communityName.localeCompare(b.communityName);
    });
    return rows;
  }

  // Admin reports queue: one page, newest first, optional status filter.
  // Resolve/dismiss lives in resolveReport; content removal in adminRemovePost.
  async listReports(input: {
    offset: number;
    limit: number;
    status?: string;
  }): Promise<{ rows: ModeratedReportRow[]; total: number }> {
    const where = input.status ? eq(reports.status, input.status) : undefined;

    const [{ total }] = await db
      .select({ total: count() })
      .from(reports)
      .where(where);

    const rows = await db
      .select({
        id: reports.id,
        resourceType: reports.resourceType,
        resourceId: reports.resourceId,
        reason: reports.reason,
        status: reports.status,
        createdAt: reports.createdAt,
        reviewedById: reports.reviewedById,
        reviewedAt: reports.reviewedAt,
        resolution: reports.resolution,
      })
      .from(reports)
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(input.limit)
      .offset(input.offset);

    return { rows, total: Number(total) };
  }

  // Fetch a single report with its moderation fields (admin moderation). Returns
  // null if absent.
  async getReport(id: string): Promise<ModeratedReportRow | null> {
    const [row] = await db
      .select({
        id: reports.id,
        resourceType: reports.resourceType,
        resourceId: reports.resourceId,
        reason: reports.reason,
        status: reports.status,
        createdAt: reports.createdAt,
        reviewedById: reports.reviewedById,
        reviewedAt: reports.reviewedAt,
        resolution: reports.resolution,
      })
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);
    return row ?? null;
  }

  // Resolve or dismiss a queued report. The transition is ATOMIC and one-way:
  // only a pending/reviewing report may transition (the UPDATE is guarded by a
  // status predicate so concurrent resolves can't both win). A report that is
  // already resolved/dismissed returns "conflict" — never a silent overwrite of
  // reviewer/time. The status update + audit row commit together (§7). The audit
  // entry references the report id only — never the reason/resolution free text
  // (may contain PII) — so it can't leak content.
  async resolveReport(input: {
    id: string;
    adminId: string;
    status: "resolved" | "dismissed";
    resolution?: string | null;
    ipAddress?: string | null;
  }): Promise<
    | { status: "ok"; report: ModeratedReportRow }
    | { status: "not_found" }
    | { status: "conflict" }
  > {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: reports.status })
        .from(reports)
        .where(eq(reports.id, input.id))
        .limit(1);
      if (!current) return { status: "not_found" as const };
      if (current.status !== "pending" && current.status !== "reviewing") {
        return { status: "conflict" as const };
      }

      const [updated] = await tx
        .update(reports)
        .set({
          status: input.status,
          reviewedById: input.adminId,
          reviewedAt: new Date(),
          resolution: input.resolution ?? null,
        })
        // Status predicate makes the transition atomic — if a concurrent tx
        // already moved it out of pending/reviewing, this matches no row.
        .where(
          and(
            eq(reports.id, input.id),
            inArray(reports.status, ["pending", "reviewing"]),
          ),
        )
        .returning({
          id: reports.id,
          resourceType: reports.resourceType,
          resourceId: reports.resourceId,
          reason: reports.reason,
          status: reports.status,
          createdAt: reports.createdAt,
          reviewedById: reports.reviewedById,
          reviewedAt: reports.reviewedAt,
          resolution: reports.resolution,
        });
      if (!updated) return { status: "conflict" as const };

      await tx.insert(auditLog).values({
        actorId: input.adminId,
        action:
          input.status === "resolved" ? "report.resolved" : "report.dismissed",
        resourceType: "report",
        resourceId: input.id,
        ipAddress: input.ipAddress ?? null,
      });

      return { status: "ok" as const, report: updated };
    });
  }

  // ── Events & RSVPs (docs/API.md §10) ────────────────────────────────────────

  // goingCount: attendees with status "going" — an AGGREGATE only, never
  // identities (attending an Article 9 community's event is sensitive). int4 cast
  // so pg returns a JS number, not a bigint string.
  private goingCountSql() {
    return sql<number>`(
      select count(*)::int from ${eventRsvps}
      where ${eventRsvps.eventId} = ${events.id} and ${eventRsvps.status} = 'going'
    )`;
  }

  // The caller's own RSVP status for the event, or null. Correlated subquery
  // parameterised on callerId (no N+1).
  private callerRsvpSql(callerId: string) {
    return sql<
      string | null
    >`(select status from ${eventRsvps} where ${eventRsvps.eventId} = ${events.id} and ${eventRsvps.userId} = ${callerId} limit 1)`;
  }

  // Whether the caller has saved this event — a private per-caller boolean (never
  // a "who saved"/count surface). Correlated EXISTS, parameterised (no N+1). The
  // events read queries always JOIN (community/block filter), so Drizzle renders
  // ${events.id} table-qualified and this correlation is unambiguous. (The
  // join-less safe-places reads can't rely on that — see callerSavedSafePlaceSql.)
  private callerSavedSql(callerId: string) {
    return sql<boolean>`exists (select 1 from ${eventSaves} where ${eventSaves.eventId} = ${events.id} and ${eventSaves.userId} = ${callerId})`;
  }

  // Column projection shared by the list/get reads (event fields + the two
  // correlated aggregates). createdById is selected for the block/auth checks.
  private eventSelection(callerId: string) {
    return {
      id: events.id,
      communityId: events.communityId,
      title: events.title,
      description: events.description,
      location: events.location,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      imageUrl: events.imageUrl,
      createdById: events.createdById,
      goingCount: this.goingCountSql(),
      callerRsvpStatus: this.callerRsvpSql(callerId),
      createdAt: events.createdAt,
      deletedAt: events.deletedAt,
      status: events.status,
      cancelledAt: events.cancelledAt,
      callerSaved: this.callerSavedSql(callerId),
      category: events.category,
    };
  }

  // Create an event. Requires a non-deleted community AND creator membership
  // (create is member-gated, mirrors createPost). Insert + event.created audit
  // commit together (§7). A fresh event has goingCount 0 and no caller RSVP.
  async createEvent(
    communityId: string,
    creatorId: string,
    input: {
      title: string;
      description?: string;
      location?: string;
      startsAt: string;
      endsAt?: string;
      category?: string;
    },
    ipAddress?: string | null,
  ): Promise<
    | { status: "created"; event: EventRow }
    | { status: "not_found" }
    | { status: "forbidden" }
  > {
    if (!(await this.communityExists(communityId))) {
      return { status: "not_found" };
    }
    if (!(await this.isCommunityMember(communityId, creatorId))) {
      return { status: "forbidden" };
    }

    const inserted = await db.transaction(async (tx) => {
      const [ev] = await tx
        .insert(events)
        .values({
          communityId,
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          category: input.category ?? null,
          createdById: creatorId,
        })
        .returning({
          id: events.id,
          communityId: events.communityId,
          title: events.title,
          description: events.description,
          location: events.location,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          imageUrl: events.imageUrl,
          createdById: events.createdById,
          createdAt: events.createdAt,
          deletedAt: events.deletedAt,
          status: events.status,
          cancelledAt: events.cancelledAt,
          category: events.category,
        });
      await tx.insert(auditLog).values({
        actorId: creatorId,
        action: "event.created",
        resourceType: "event",
        resourceId: ev.id,
        ipAddress: ipAddress ?? null,
      });
      return ev;
    });

    return {
      status: "created",
      event: {
        ...inserted,
        goingCount: 0,
        callerRsvpStatus: null,
        callerSaved: false,
      },
    };
  }

  // One page of the GLOBAL upcoming-events feed (across all non-deleted
  // communities), soonest-first, keyset-paginated on (startsAt, id) ASC. Excludes
  // deleted events, past events (startsAt < now), and events whose creator the
  // caller has blocked (createdById IS NULL is never blocked). Exposes goingCount
  // only — no attendee identities. Returns rows + the next opaque cursor.
  async listUpcomingEvents(input: {
    callerId: string;
    limit: number;
    cursor?: { startsAt: Date; id: string } | null;
    category?: string;
    now?: Date;
  }): Promise<{
    rows: EventRow[];
    nextCursor: { startsAt: Date; id: string } | null;
  }> {
    const now = input.now ?? new Date();
    const blockedIds = await this.getBlockedUserIds(input.callerId);

    const conditions: (SQL | undefined)[] = [
      isNull(events.deletedAt),
      eq(events.status, "active"), // discovery feed hides cancelled events
      gte(events.startsAt, now),
    ];
    // Optional predefined-category filter (slice D). Only rows with exactly this
    // category match — events with category NULL are excluded from a filtered feed.
    if (input.category) {
      conditions.push(eq(events.category, input.category));
    }
    if (blockedIds.length) {
      conditions.push(
        or(
          isNull(events.createdById),
          notInArray(events.createdById, blockedIds),
        ),
      );
    }
    if (input.cursor) {
      conditions.push(
        or(
          gt(events.startsAt, input.cursor.startsAt),
          and(
            eq(events.startsAt, input.cursor.startsAt),
            gt(events.id, input.cursor.id),
          ),
        ),
      );
    }

    const rows = await db
      .select(this.eventSelection(input.callerId))
      .from(events)
      .innerJoin(
        communities,
        and(
          eq(communities.id, events.communityId),
          isNull(communities.deletedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? { startsAt: last.startsAt, id: last.id } : null;
    return { rows: page, nextCursor };
  }

  // The caller's OWN upcoming events — the ones they RSVP'd "going" to (the Home
  // "Nadchodzące wydarzenia" rail). Caller-scoped via an INNER JOIN on the
  // caller's going RSVP; same visibility rules as the global feed (non-deleted
  // event + community, startsAt >= now, creator-block-filtered). Soonest-first,
  // capped (no cursor — a short personal rail). goingCount aggregate only.
  async listMyUpcomingEvents(input: {
    callerId: string;
    limit: number;
    now?: Date;
  }): Promise<EventRow[]> {
    const now = input.now ?? new Date();
    const blockedIds = await this.getBlockedUserIds(input.callerId);

    const conditions: (SQL | undefined)[] = [
      isNull(events.deletedAt),
      eq(events.status, "active"), // the Home rail hides cancelled events too
      gte(events.startsAt, now),
    ];
    if (blockedIds.length) {
      conditions.push(
        or(
          isNull(events.createdById),
          notInArray(events.createdById, blockedIds),
        ),
      );
    }

    return (
      db
        .select(this.eventSelection(input.callerId))
        .from(events)
        .innerJoin(
          communities,
          and(
            eq(communities.id, events.communityId),
            isNull(communities.deletedAt),
          ),
        )
        // caller-scoped: only events this user RSVP'd "going" to
        .innerJoin(
          eventRsvps,
          and(
            eq(eventRsvps.eventId, events.id),
            eq(eventRsvps.userId, input.callerId),
            eq(eventRsvps.status, "going"),
          ),
        )
        .where(and(...conditions))
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(input.limit)
    );
  }

  // The caller's SAVED upcoming events (the "Saved" list). Same shape as
  // listMyUpcomingEvents but caller-scoped via an INNER JOIN on event_saves
  // instead of a going RSVP. Same visibility (non-deleted event + community,
  // startsAt >= now, active, creator-block-filtered). Soonest-first, capped.
  async listSavedEvents(input: {
    callerId: string;
    limit: number;
    now?: Date;
  }): Promise<EventRow[]> {
    const now = input.now ?? new Date();
    const blockedIds = await this.getBlockedUserIds(input.callerId);

    const conditions: (SQL | undefined)[] = [
      isNull(events.deletedAt),
      eq(events.status, "active"),
      gte(events.startsAt, now),
    ];
    if (blockedIds.length) {
      conditions.push(
        or(
          isNull(events.createdById),
          notInArray(events.createdById, blockedIds),
        ),
      );
    }

    return (
      db
        .select(this.eventSelection(input.callerId))
        .from(events)
        .innerJoin(
          communities,
          and(
            eq(communities.id, events.communityId),
            isNull(communities.deletedAt),
          ),
        )
        // caller-scoped: only events this user has saved
        .innerJoin(
          eventSaves,
          and(
            eq(eventSaves.eventId, events.id),
            eq(eventSaves.userId, input.callerId),
          ),
        )
        .where(and(...conditions))
        .orderBy(asc(events.startsAt), asc(events.id))
        .limit(input.limit)
    );
  }

  // A single event (incl. deletedAt so the route can 404 tombstones). Returns
  // null when missing, in a deleted community, or created by someone the caller
  // has blocked (→ route 404). Includes goingCount + the caller's own RSVP.
  async getEvent(id: string, callerId: string): Promise<EventRow | null> {
    const [row] = await db
      .select(this.eventSelection(callerId))
      .from(events)
      .innerJoin(
        communities,
        and(
          eq(communities.id, events.communityId),
          isNull(communities.deletedAt),
        ),
      )
      .where(eq(events.id, id))
      .limit(1);
    if (!row) return null;

    if (row.createdById) {
      const blockedIds = await this.getBlockedUserIds(callerId);
      if (blockedIds.includes(row.createdById)) return null;
    }
    return row;
  }

  // Edit an event (creator OR a community mod/admin). The merged-candidate range
  // guard rejects a one-sided PATCH that would invert the times (the schema-level
  // refine only fires when both dates are in the body). deletedAt + event.updated
  // audit commit together (§7). Empty bodies are rejected at the schema layer.
  async updateEvent(
    id: string,
    actorId: string,
    input: {
      title?: string;
      description?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
      category?: string;
    },
    ipAddress?: string | null,
  ): Promise<"updated" | "not_found" | "forbidden" | "invalid_range"> {
    const [ev] = await db
      .select({
        communityId: events.communityId,
        createdById: events.createdById,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        deletedAt: events.deletedAt,
      })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    if (!ev || ev.deletedAt) return "not_found";

    let authorized = ev.createdById === actorId;
    if (!authorized) {
      const [m] = await db
        .select({ role: communityMemberships.role })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ev.communityId),
            eq(communityMemberships.userId, actorId),
          ),
        )
        .limit(1);
      authorized = m?.role === "moderator" || m?.role === "admin";
    }
    if (!authorized) return "forbidden";

    // Validate the MERGED candidate, not just the request body.
    const effectiveStartsAt = input.startsAt
      ? new Date(input.startsAt)
      : ev.startsAt;
    const effectiveEndsAt = input.endsAt ? new Date(input.endsAt) : ev.endsAt;
    if (effectiveEndsAt && effectiveEndsAt <= effectiveStartsAt) {
      return "invalid_range";
    }

    const patch: Partial<typeof events.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.location !== undefined) patch.location = input.location;
    if (input.startsAt !== undefined) patch.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) patch.endsAt = new Date(input.endsAt);
    if (input.category !== undefined) patch.category = input.category;

    // Guard the write itself (not only the precheck): if a concurrent
    // soft-delete/admin-remove tombstones the row between the precheck and here,
    // `deletedAt IS NULL` makes this UPDATE a no-op so PATCH can't resurrect
    // content onto a deleted event — and the audit is written only if a row
    // changed (mirrors softDeleteEvent / adminRemoveEvent).
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(events)
        .set(patch)
        .where(and(eq(events.id, id), isNull(events.deletedAt)))
        .returning({ id: events.id });
      if (!updated) return "not_found";

      await tx.insert(auditLog).values({
        actorId,
        action: "event.updated",
        resourceType: "event",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "updated";
    });
  }

  // Soft-delete an event (creator OR a community mod/admin). Authorization first,
  // then an atomic guarded UPDATE (`deletedAt IS NULL`) so a concurrent delete
  // can't double-write the event.deleted audit. Scrubs stored title/desc/media.
  async softDeleteEvent(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found" | "forbidden"> {
    const [ev] = await db
      .select({
        communityId: events.communityId,
        createdById: events.createdById,
        deletedAt: events.deletedAt,
      })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    if (!ev || ev.deletedAt) return "not_found";

    let authorized = ev.createdById === actorId;
    if (!authorized) {
      const [m] = await db
        .select({ role: communityMemberships.role })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ev.communityId),
            eq(communityMemberships.userId, actorId),
          ),
        )
        .limit(1);
      authorized = m?.role === "moderator" || m?.role === "admin";
    }
    if (!authorized) return "forbidden";

    return db.transaction(async (tx) => {
      const [removed] = await tx
        .update(events)
        .set({
          title: "[deleted]",
          description: null,
          location: null,
          imageUrl: null,
          deletedAt: new Date(),
        })
        .where(and(eq(events.id, id), isNull(events.deletedAt)))
        .returning({ id: events.id });
      if (!removed) return "not_found";

      await tx.insert(auditLog).values({
        actorId,
        action: "event.deleted",
        resourceType: "event",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // Cancel an event (CREATOR ONLY — organiser lifecycle, distinct from the
  // creator-or-mod/admin softDelete and the admin moderation remove). Unlike a
  // soft-delete this keeps title/description/location/image so RSVP'd users still
  // see WHAT was cancelled; it only flips status + stamps cancelledAt. Authorize
  // precheck picks the right status code; the guarded UPDATE (WHERE status =
  // 'active') is the race net + writes the event.cancelled audit once in the same
  // tx. RSVPs are intentionally kept.
  async cancelEvent(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<
    "cancelled" | "not_found" | "forbidden" | "already_cancelled" | "past"
  > {
    const [ev] = await db
      .select({
        createdById: events.createdById,
        status: events.status,
        startsAt: events.startsAt,
        deletedAt: events.deletedAt,
      })
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    if (!ev || ev.deletedAt) return "not_found";
    if (ev.createdById !== actorId) return "forbidden";
    if (ev.status === "cancelled") return "already_cancelled";
    // A past event can't be cancelled — it already happened. Keeps the endpoint
    // consistent with the DTO's `canCancel` flag (creator ∧ active ∧ !past).
    if (ev.startsAt < new Date()) return "past";

    return db.transaction(async (tx) => {
      const [cancelled] = await tx
        .update(events)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(events.id, id),
            eq(events.status, "active"),
            isNull(events.deletedAt),
          ),
        )
        .returning({ id: events.id });
      if (!cancelled) {
        // Lost a race between the precheck and here: re-read to classify a
        // concurrent cancel (→ already_cancelled) vs a concurrent delete (→ 404).
        const [now] = await tx
          .select({ status: events.status, deletedAt: events.deletedAt })
          .from(events)
          .where(eq(events.id, id))
          .limit(1);
        if (now && !now.deletedAt && now.status === "cancelled") {
          return "already_cancelled";
        }
        return "not_found";
      }

      await tx.insert(auditLog).values({
        actorId,
        action: "event.cancelled",
        resourceType: "event",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "cancelled";
    });
  }

  // Upsert the caller's RSVP. Community-member-gated: only a member of the
  // event's community may RSVP (mirrors the in-group model). Visible-event-only
  // (getEvent hides deleted/community-deleted/block-hidden). Not audited (RSVP is
  // a benign toggle; the row itself is the record). Rejects a cancelled or
  // already-started event with "conflict" (→ 409). Returns "ok"/404/403/409.
  async setRsvp(
    eventId: string,
    userId: string,
    status: "going" | "interested" | "not_going",
  ): Promise<"ok" | "not_found" | "forbidden" | "conflict"> {
    return db.transaction(async (tx) => {
      // Lock the event row so a concurrent creator-cancel can't slip in between
      // the state check and the RSVP write. cancelEvent's guarded UPDATE takes the
      // same row lock: it either commits first (we then read status = 'cancelled'
      // → conflict) or waits behind us. This makes "no RSVP persists on a
      // cancelled/past event" atomic, not a racy read-then-write.
      const [ev] = await tx
        .select({
          communityId: events.communityId,
          createdById: events.createdById,
          status: events.status,
          startsAt: events.startsAt,
          deletedAt: events.deletedAt,
        })
        .from(events)
        .where(eq(events.id, eventId))
        .for("update");
      if (!ev || ev.deletedAt) return "not_found";

      // Same visibility rules as getEvent: the community must still be live, and a
      // blocked creator hides the event (→ 404, no info leak).
      if (!(await this.communityExists(ev.communityId))) return "not_found";
      if (ev.createdById) {
        const blockedIds = await this.getBlockedUserIds(userId);
        if (blockedIds.includes(ev.createdById)) return "not_found";
      }

      // Member-gated (checked before lifecycle so non-members always get 403 and
      // never learn whether the event was cancelled).
      if (!(await this.isCommunityMember(ev.communityId, userId))) {
        return "forbidden";
      }

      // Can't RSVP to a cancelled or already-started event.
      if (ev.status === "cancelled" || ev.startsAt < new Date()) {
        return "conflict";
      }

      await tx
        .insert(eventRsvps)
        .values({ eventId, userId, status })
        .onConflictDoUpdate({
          target: [eventRsvps.eventId, eventRsvps.userId],
          set: { status },
        });
      return "ok";
    });
  }

  // Save (bookmark) an event. Visible-event-only (getEvent hides deleted /
  // community-deleted / block-hidden → not_found). Idempotent via
  // onConflictDoNothing on the unique (event_id, user_id). Private + NOT audited
  // (a benign per-user toggle, like setRsvp). Returns "ok" / "not_found".
  async saveEvent(
    eventId: string,
    userId: string,
  ): Promise<"ok" | "not_found"> {
    const event = await this.getEvent(eventId, userId);
    if (!event || event.deletedAt) return "not_found";
    await db
      .insert(eventSaves)
      .values({ eventId, userId })
      .onConflictDoNothing();
    return "ok";
  }

  // Unsave (remove the bookmark). Idempotent — removing a non-existent save is a
  // no-op; always "ok" (you can always drop your own bookmark, even for an event
  // that has since been deleted). Not audited.
  async unsaveEvent(eventId: string, userId: string): Promise<"ok"> {
    await db
      .delete(eventSaves)
      .where(
        and(eq(eventSaves.eventId, eventId), eq(eventSaves.userId, userId)),
      );
    return "ok";
  }

  // Admin content removal (moderation). Platform-admin authority — no community
  // membership check (the route is requireAdmin-gated, unlike softDeletePost
  // which is author/community-mod gated). Post-only this slice. Scrubs stored
  // content/media in the same transaction as the moderation.content_removed
  // audit (§7); the audit references the post id only, never the removed text.
  // A missing or already-deleted post returns "not_found".
  async adminRemovePost(
    postId: string,
    adminId: string,
    ipAddress?: string | null,
  ): Promise<"removed" | "not_found"> {
    return db.transaction(async (tx) => {
      // Guarded UPDATE makes the removal atomic — `deletedAt IS NULL` ensures a
      // concurrent remove can't also match, so the audit row is written at most
      // once. No row updated ⇒ missing or already-removed ⇒ not_found.
      const [removed] = await tx
        .update(posts)
        .set({ content: "[deleted]", imageUrl: null, deletedAt: new Date() })
        .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
        .returning({ id: posts.id });
      if (!removed) return "not_found";

      await tx.insert(auditLog).values({
        actorId: adminId,
        action: "moderation.content_removed",
        resourceType: "post",
        resourceId: postId,
        ipAddress: ipAddress ?? null,
      });
      return "removed";
    });
  }

  // Admin event removal (moderation). Mirrors adminRemovePost: platform-admin
  // authority (route is requireAdmin-gated), atomic guarded UPDATE so the
  // moderation.content_removed audit is written at most once. Scrubs stored
  // title/desc/media. Missing/already-removed → "not_found".
  async adminRemoveEvent(
    eventId: string,
    adminId: string,
    ipAddress?: string | null,
  ): Promise<"removed" | "not_found"> {
    return db.transaction(async (tx) => {
      const [removed] = await tx
        .update(events)
        .set({
          title: "[deleted]",
          description: null,
          location: null,
          imageUrl: null,
          deletedAt: new Date(),
        })
        .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
        .returning({ id: events.id });
      if (!removed) return "not_found";

      await tx.insert(auditLog).values({
        actorId: adminId,
        action: "moderation.content_removed",
        resourceType: "event",
        resourceId: eventId,
        ipAddress: ipAddress ?? null,
      });
      return "removed";
    });
  }

  // ── Safe places (admin-curated venues, docs/API.md §11) ─────────────────────
  // Coordinates are admin-curated VENUE data, not user location (§5.8). Audit
  // rows for safe-place mutations carry IDs only — NEVER name/category/address/
  // city/coords. `near` (from a user query) is used ONLY for the ORDER BY below;
  // it is never persisted or logged (the %3F logger is path-only; the request
  // logger logs req.path only).

  private safePlaceColumns() {
    return {
      id: safePlaces.id,
      name: safePlaces.name,
      category: safePlaces.category,
      description: safePlaces.description,
      address: safePlaces.address,
      city: safePlaces.city,
      latitude: safePlaces.latitude,
      longitude: safePlaces.longitude,
      imageKey: safePlaces.imageKey,
      accessibilityFeatures: safePlaces.accessibilityFeatures,
    };
  }

  // Private "has the caller saved this place" flag as an EXISTS subquery. The
  // outer place id is qualified as "safe_places"."id" ON PURPOSE: the safe-places
  // reads have NO join, so interpolating ${safePlaces.id} renders UNqualified
  // ("id"), and safe_place_saves ALSO has an `id` column — the correlation would
  // then silently bind to the save row's own PK instead of the outer place
  // (making `saved` always false). Never a count / who-saved surface — Article 9.
  private callerSavedSafePlaceSql(callerId: string) {
    return sql<boolean>`exists (select 1 from ${safePlaceSaves} where ${safePlaceSaves.safePlaceId} = "safe_places"."id" and ${safePlaceSaves.userId} = ${callerId})`;
  }

  // One page of visible (non-deleted) safe places + the total. Optional filters:
  // category (exact), city (case-insensitive exact). `near` does NOT filter — it
  // orders nearest-first via the great-circle central-angle cosine (higher cos =
  // closer; no acos → float-safe), with null-coordinate rows LAST. Every list has
  // a deterministic total order ending in `id`, so offset pagination can't drift.
  async listSafePlaces(input: {
    callerId: string;
    page: number;
    pageSize: number;
    category?: string;
    city?: string;
    search?: string;
    near?: { lat: number; lng: number };
  }): Promise<{ rows: SafePlaceReadRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [isNull(safePlaces.deletedAt)];
    if (input.category)
      conditions.push(eq(safePlaces.category, input.category));
    if (input.city)
      conditions.push(ilike(safePlaces.city, likeEscape(input.city)));
    // Free-text search: case-insensitive substring over name + city + address
    // (metachars escaped). Lets the mobile box match a partial place name, not
    // just an exact city.
    if (input.search) {
      const term = `%${likeEscape(input.search)}%`;
      conditions.push(
        or(
          ilike(safePlaces.name, term),
          ilike(safePlaces.city, term),
          ilike(safePlaces.address, term),
        ),
      );
    }
    const where = and(...conditions);

    const orderBy: SQL[] = [];
    if (input.near) {
      orderBy.push(
        sql`case when ${safePlaces.latitude} is null or ${safePlaces.longitude} is null then 1 else 0 end`,
        sql`(sin(radians(${input.near.lat})) * sin(radians(${safePlaces.latitude})) + cos(radians(${input.near.lat})) * cos(radians(${safePlaces.latitude})) * cos(radians(${safePlaces.longitude}) - radians(${input.near.lng}))) desc`,
      );
    }
    orderBy.push(
      sql`${safePlaces.city} asc nulls last`,
      sql`${safePlaces.name} asc`,
      sql`${safePlaces.id} asc`,
    );

    const rows = await db
      .select({
        ...this.safePlaceColumns(),
        callerSaved: this.callerSavedSafePlaceSql(input.callerId),
      })
      .from(safePlaces)
      .where(where)
      .orderBy(...orderBy)
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ n }] = await db
      .select({ n: count() })
      .from(safePlaces)
      .where(where);

    return { rows, total: Number(n) };
  }

  // Trimmed marker projection for the map (P-40 SP-4): EVERY visible venue that
  // has BOTH coordinates, as id/name/category/lat/lng only — no caller-saved
  // join, no offset/count/near. Same filters as listSafePlaces (so the map
  // matches the active feed filters). UNPAGINATED but capped (default
  // MAX_SAFE_PLACE_MARKERS; a curated Poland set stays well under it) with a
  // deterministic `city, name, id` order so the cap truncates consistently. The
  // `isNotNull` guards on both coords mean the returned lat/lng are non-null
  // (narrowed below); `limit` is injectable so the boundary is testable.
  async listSafePlaceMarkers(input: {
    category?: string;
    city?: string;
    search?: string;
    limit?: number;
  }): Promise<
    {
      id: string;
      name: string;
      category: string;
      latitude: number;
      longitude: number;
    }[]
  > {
    const conditions: (SQL | undefined)[] = [
      isNull(safePlaces.deletedAt),
      isNotNull(safePlaces.latitude),
      isNotNull(safePlaces.longitude),
    ];
    if (input.category)
      conditions.push(eq(safePlaces.category, input.category));
    if (input.city)
      conditions.push(ilike(safePlaces.city, likeEscape(input.city)));
    if (input.search) {
      const term = `%${likeEscape(input.search)}%`;
      conditions.push(
        or(
          ilike(safePlaces.name, term),
          ilike(safePlaces.city, term),
          ilike(safePlaces.address, term),
        ),
      );
    }

    const rows = await db
      .select({
        id: safePlaces.id,
        name: safePlaces.name,
        category: safePlaces.category,
        latitude: safePlaces.latitude,
        longitude: safePlaces.longitude,
      })
      .from(safePlaces)
      .where(and(...conditions))
      .orderBy(
        sql`${safePlaces.city} asc nulls last`,
        sql`${safePlaces.name} asc`,
        sql`${safePlaces.id} asc`,
      )
      .limit(input.limit ?? MAX_SAFE_PLACE_MARKERS);

    // The WHERE guarantees both coordinates are present — narrow the nullable
    // column types to the non-null marker shape.
    return rows.map((r) => ({
      ...r,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
    }));
  }

  async getSafePlace(
    id: string,
    callerId: string,
  ): Promise<SafePlaceReadRow | null> {
    const [row] = await db
      .select({
        ...this.safePlaceColumns(),
        callerSaved: this.callerSavedSafePlaceSql(callerId),
      })
      .from(safePlaces)
      .where(and(eq(safePlaces.id, id), isNull(safePlaces.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // Admin create. Insert + safe_place.created audit commit together (§7).
  async createSafePlace(
    input: {
      name: string;
      category: string;
      description?: string;
      address?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      imageKey?: string; // already confirmed by the route before we're called
      accessibilityFeatures?: string[];
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<SafePlaceRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(safePlaces)
        .values({
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          address: input.address ?? null,
          city: input.city ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          imageKey: input.imageKey ?? null,
          accessibilityFeatures: [
            ...new Set(input.accessibilityFeatures ?? []),
          ],
          createdById: actorId,
        })
        .returning(this.safePlaceColumns());
      await tx.insert(auditLog).values({
        actorId,
        action: "safe_place.created",
        resourceType: "safe_place",
        resourceId: row.id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin partial update (guarded to non-deleted). Update + safe_place.updated
  // audit commit together. Returns null if missing/deleted. Only provided fields
  // are written (undefined = untouched); coords are both-or-neither at validation.
  async updateSafePlace(
    id: string,
    input: {
      name?: string;
      category?: string;
      description?: string;
      address?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      // undefined = untouched · null = clear the photo · string = a confirmed key.
      imageKey?: string | null;
      // undefined = untouched · a provided array = full replace ([] clears).
      accessibilityFeatures?: string[];
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<SafePlaceRow | null> {
    const fields: Partial<typeof safePlaces.$inferInsert> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.category !== undefined) fields.category = input.category;
    if (input.description !== undefined) fields.description = input.description;
    if (input.address !== undefined) fields.address = input.address;
    if (input.city !== undefined) fields.city = input.city;
    if (input.latitude !== undefined) fields.latitude = input.latitude;
    if (input.longitude !== undefined) fields.longitude = input.longitude;
    if (input.imageKey !== undefined) fields.imageKey = input.imageKey;
    if (input.accessibilityFeatures !== undefined)
      fields.accessibilityFeatures = [...new Set(input.accessibilityFeatures)];

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(safePlaces)
        .set(fields)
        .where(and(eq(safePlaces.id, id), isNull(safePlaces.deletedAt)))
        .returning(this.safePlaceColumns());
      if (!row) return null;
      await tx.insert(auditLog).values({
        actorId,
        action: "safe_place.updated",
        resourceType: "safe_place",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin soft-delete (guarded UPDATE ... WHERE deletedAt IS NULL). Idempotent-
  // safe: "not_found" if missing/already deleted. Audited safe_place.deleted.
  async softDeleteSafePlace(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found"> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(safePlaces)
        .set({ deletedAt: new Date() })
        .where(and(eq(safePlaces.id, id), isNull(safePlaces.deletedAt)))
        .returning({ id: safePlaces.id });
      if (!row) return "not_found";
      await tx.insert(auditLog).values({
        actorId,
        action: "safe_place.deleted",
        resourceType: "safe_place",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // ── Resources (admin-curated Support & Education content, P-37) ──────────────
  // Admin-published content (never user data); audit rows for resource mutations
  // carry IDs only — NEVER title/category/body/url.

  private resourceColumns() {
    return {
      id: resources.id,
      title: resources.title,
      category: resources.category,
      body: resources.body,
      url: resources.url,
      featured: resources.featured,
      createdAt: resources.createdAt,
    };
  }

  // One page of visible (non-deleted) resources + the total. Optional category
  // filter (exact). Featured first, then newest, then id — a deterministic total
  // order so offset pagination can't drift.
  async listResources(input: {
    page: number;
    pageSize: number;
    category?: string;
    search?: string;
  }): Promise<{ rows: ResourceRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [isNull(resources.deletedAt)];
    if (input.category) conditions.push(eq(resources.category, input.category));
    // Case-insensitive substring over title + body. likeEscape() keeps a literal
    // %/_ in the term from acting as a wildcard (mirrors listSafePlaces).
    if (input.search) {
      const term = `%${likeEscape(input.search)}%`;
      conditions.push(
        or(ilike(resources.title, term), ilike(resources.body, term)),
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select(this.resourceColumns())
      .from(resources)
      .where(where)
      .orderBy(
        sql`${resources.featured} desc`,
        sql`${resources.createdAt} desc`,
        sql`${resources.id} asc`,
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ n }] = await db
      .select({ n: count() })
      .from(resources)
      .where(where);

    return { rows, total: Number(n) };
  }

  async getResource(id: string): Promise<ResourceRow | null> {
    const [row] = await db
      .select(this.resourceColumns())
      .from(resources)
      .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // Admin create. Insert + resource.created audit commit together (§7).
  async createResource(
    input: {
      title: string;
      category: string;
      body: string;
      url?: string;
      featured?: boolean;
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<ResourceRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(resources)
        .values({
          title: input.title,
          category: input.category,
          body: input.body,
          url: input.url ?? null,
          featured: input.featured ?? false,
          createdById: actorId,
        })
        .returning(this.resourceColumns());
      await tx.insert(auditLog).values({
        actorId,
        action: "resource.created",
        resourceType: "resource",
        resourceId: row.id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin partial update (guarded to non-deleted). Only provided fields written
  // (undefined = untouched; url null = remove). Returns null if missing/deleted.
  async updateResource(
    id: string,
    input: {
      title?: string;
      category?: string;
      body?: string;
      url?: string | null;
      featured?: boolean;
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<ResourceRow | null> {
    const fields: Partial<typeof resources.$inferInsert> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.category !== undefined) fields.category = input.category;
    if (input.body !== undefined) fields.body = input.body;
    if (input.url !== undefined) fields.url = input.url;
    if (input.featured !== undefined) fields.featured = input.featured;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(resources)
        .set(fields)
        .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
        .returning(this.resourceColumns());
      if (!row) return null;
      await tx.insert(auditLog).values({
        actorId,
        action: "resource.updated",
        resourceType: "resource",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin soft-delete (guarded UPDATE ... WHERE deletedAt IS NULL). Idempotent-
  // safe: "not_found" if missing/already deleted. Audited resource.deleted.
  async softDeleteResource(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found"> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(resources)
        .set({ deletedAt: new Date() })
        .where(and(eq(resources.id, id), isNull(resources.deletedAt)))
        .returning({ id: resources.id });
      if (!row) return "not_found";
      await tx.insert(auditLog).values({
        actorId,
        action: "resource.deleted",
        resourceType: "resource",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // ── News (admin-curated pillar-3 News content, P-31) ─────────────────────────
  // Admin-published content (never user data); audit rows for news mutations carry
  // IDs only — NEVER title/summary/body/source. `imageKey` is projected
  // server-internal (the route signs it into `imageUrl`, never serialises the key).

  private newsColumns() {
    return {
      id: news.id,
      title: news.title,
      summary: news.summary,
      body: news.body,
      category: news.category,
      source: news.source,
      sourceUrl: news.sourceUrl,
      imageKey: news.imageKey,
      featured: news.featured,
      createdAt: news.createdAt,
    };
  }

  // One page of visible (non-deleted) news + the total. Optional category filter
  // (exact) + optional search (title + summary + body). Featured first, then
  // newest, then id — a deterministic total order so offset pagination can't drift.
  async listNews(input: {
    page: number;
    pageSize: number;
    category?: string;
    search?: string;
  }): Promise<{ rows: NewsRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [isNull(news.deletedAt)];
    if (input.category) conditions.push(eq(news.category, input.category));
    // Case-insensitive substring over title + summary + body. likeEscape() keeps a
    // literal %/_ in the term from acting as a wildcard (mirrors listResources).
    if (input.search) {
      const term = `%${likeEscape(input.search)}%`;
      conditions.push(
        or(
          ilike(news.title, term),
          ilike(news.summary, term),
          ilike(news.body, term),
        ),
      );
    }
    const where = and(...conditions);

    const rows = await db
      .select(this.newsColumns())
      .from(news)
      .where(where)
      .orderBy(
        sql`${news.featured} desc`,
        sql`${news.createdAt} desc`,
        sql`${news.id} asc`,
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ n }] = await db.select({ n: count() }).from(news).where(where);

    return { rows, total: Number(n) };
  }

  async getNews(id: string): Promise<NewsRow | null> {
    const [row] = await db
      .select(this.newsColumns())
      .from(news)
      .where(and(eq(news.id, id), isNull(news.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // Admin create. Insert + news.created audit commit together (§7).
  async createNews(
    input: {
      title: string;
      summary: string;
      body?: string;
      category: string;
      source: string;
      sourceUrl?: string;
      featured?: boolean;
      imageKey?: string; // already confirmed by the route before we're called
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<NewsRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(news)
        .values({
          title: input.title,
          summary: input.summary,
          body: input.body ?? null,
          category: input.category,
          source: input.source,
          sourceUrl: input.sourceUrl ?? null,
          imageKey: input.imageKey ?? null,
          featured: input.featured ?? false,
          createdById: actorId,
        })
        .returning(this.newsColumns());
      await tx.insert(auditLog).values({
        actorId,
        action: "news.created",
        resourceType: "news",
        resourceId: row.id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin partial update (guarded to non-deleted). Only provided fields written
  // (undefined = untouched; body/sourceUrl null = clear). Returns null if
  // missing/deleted.
  async updateNews(
    id: string,
    input: {
      title?: string;
      summary?: string;
      body?: string | null;
      category?: string;
      source?: string;
      sourceUrl?: string | null;
      featured?: boolean;
      imageKey?: string | null; // confirmed by the route; null = remove the photo
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<NewsRow | null> {
    const fields: Partial<typeof news.$inferInsert> = {};
    if (input.title !== undefined) fields.title = input.title;
    if (input.summary !== undefined) fields.summary = input.summary;
    if (input.body !== undefined) fields.body = input.body;
    if (input.category !== undefined) fields.category = input.category;
    if (input.source !== undefined) fields.source = input.source;
    if (input.sourceUrl !== undefined) fields.sourceUrl = input.sourceUrl;
    if (input.imageKey !== undefined) fields.imageKey = input.imageKey;
    if (input.featured !== undefined) fields.featured = input.featured;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(news)
        .set(fields)
        .where(and(eq(news.id, id), isNull(news.deletedAt)))
        .returning(this.newsColumns());
      if (!row) return null;
      await tx.insert(auditLog).values({
        actorId,
        action: "news.updated",
        resourceType: "news",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin soft-delete (guarded UPDATE ... WHERE deletedAt IS NULL). Idempotent-
  // safe: "not_found" if missing/already deleted. Audited news.deleted.
  async softDeleteNews(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found"> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(news)
        .set({ deletedAt: new Date() })
        .where(and(eq(news.id, id), isNull(news.deletedAt)))
        .returning({ id: news.id });
      if (!row) return "not_found";
      await tx.insert(auditLog).values({
        actorId,
        action: "news.deleted",
        resourceType: "news",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // ── Crisis contacts (admin-curated "Pomoc w kryzysie" helplines, P-37) ───────
  // Admin-published content (never user data); audit rows for crisis-contact
  // mutations carry IDs only — NEVER name/phone/description. Reads are public
  // (routes/crisisContacts.ts); writes are admin-only (routes/admin.ts).

  private crisisContactColumns() {
    return {
      id: crisisContacts.id,
      name: crisisContacts.name,
      phone: crisisContacts.phone,
      description: crisisContacts.description,
      hours: crisisContacts.hours,
      category: crisisContacts.category,
      verifiedAt: crisisContacts.verifiedAt,
      createdAt: crisisContacts.createdAt,
    };
  }

  // One page of visible (non-deleted) crisis contacts + the total. Optional
  // category filter (exact). Ordered emergency-first (112 leads), then newest,
  // then id — a deterministic total order so offset pagination can't drift.
  async listCrisisContacts(input: {
    page: number;
    pageSize: number;
    category?: string;
    verifiedOnly?: boolean;
  }): Promise<{ rows: CrisisContactRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [isNull(crisisContacts.deletedAt)];
    if (input.category)
      conditions.push(eq(crisisContacts.category, input.category));
    // The PUBLIC read passes verifiedOnly:true so unverified (not-yet-vetted)
    // contacts never leave the server — `verified` is a real publish gate. The
    // admin list omits it (admins see all, incl. unverified, to manage them).
    if (input.verifiedOnly)
      conditions.push(isNotNull(crisisContacts.verifiedAt));
    const where = and(...conditions);

    const rows = await db
      .select(this.crisisContactColumns())
      .from(crisisContacts)
      .where(where)
      .orderBy(
        sql`case ${crisisContacts.category}
              when 'emergency' then 0
              when 'emotional_crisis' then 1
              when 'legal' then 2
              when 'community' then 3
              else 4 end`,
        sql`${crisisContacts.createdAt} desc`,
        sql`${crisisContacts.id} asc`,
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    const [{ n }] = await db
      .select({ n: count() })
      .from(crisisContacts)
      .where(where);

    return { rows, total: Number(n) };
  }

  async getCrisisContact(
    id: string,
    opts?: { verifiedOnly?: boolean },
  ): Promise<CrisisContactRow | null> {
    const conditions: (SQL | undefined)[] = [
      eq(crisisContacts.id, id),
      isNull(crisisContacts.deletedAt),
    ];
    // Public read: an unverified contact resolves to null → 404 (never exposed).
    if (opts?.verifiedOnly)
      conditions.push(isNotNull(crisisContacts.verifiedAt));
    const [row] = await db
      .select(this.crisisContactColumns())
      .from(crisisContacts)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  // Admin create. Insert + crisis_contact.created audit commit together (§7).
  // `verified` true stamps verifiedAt = now(); false/omitted leaves it null.
  async createCrisisContact(
    input: {
      name: string;
      phone: string;
      description: string;
      hours?: string;
      category: string;
      verified?: boolean;
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<CrisisContactRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(crisisContacts)
        .values({
          name: input.name,
          phone: input.phone,
          description: input.description,
          hours: input.hours ?? null,
          category: input.category,
          verifiedAt: input.verified ? new Date() : null,
          createdById: actorId,
        })
        .returning(this.crisisContactColumns());
      await tx.insert(auditLog).values({
        actorId,
        action: "crisis_contact.created",
        resourceType: "crisis_contact",
        resourceId: row.id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin partial update (guarded to non-deleted). Only provided fields written
  // (undefined = untouched; hours null = remove; verified true ⇒ stamp now, false
  // ⇒ clear). Returns null if missing/deleted.
  async updateCrisisContact(
    id: string,
    input: {
      name?: string;
      phone?: string;
      description?: string;
      hours?: string | null;
      category?: string;
      verified?: boolean;
    },
    actorId: string,
    ipAddress?: string | null,
  ): Promise<CrisisContactRow | null> {
    const fields: Partial<typeof crisisContacts.$inferInsert> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.phone !== undefined) fields.phone = input.phone;
    if (input.description !== undefined) fields.description = input.description;
    if (input.hours !== undefined) fields.hours = input.hours;
    if (input.category !== undefined) fields.category = input.category;
    if (input.verified !== undefined)
      fields.verifiedAt = input.verified ? new Date() : null;

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(crisisContacts)
        .set(fields)
        .where(and(eq(crisisContacts.id, id), isNull(crisisContacts.deletedAt)))
        .returning(this.crisisContactColumns());
      if (!row) return null;
      await tx.insert(auditLog).values({
        actorId,
        action: "crisis_contact.updated",
        resourceType: "crisis_contact",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return row;
    });
  }

  // Admin soft-delete (guarded UPDATE ... WHERE deletedAt IS NULL). Idempotent-
  // safe: "not_found" if missing/already deleted. Audited crisis_contact.deleted.
  async softDeleteCrisisContact(
    id: string,
    actorId: string,
    ipAddress?: string | null,
  ): Promise<"deleted" | "not_found"> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(crisisContacts)
        .set({ deletedAt: new Date() })
        .where(and(eq(crisisContacts.id, id), isNull(crisisContacts.deletedAt)))
        .returning({ id: crisisContacts.id });
      if (!row) return "not_found";
      await tx.insert(auditLog).values({
        actorId,
        action: "crisis_contact.deleted",
        resourceType: "crisis_contact",
        resourceId: id,
        ipAddress: ipAddress ?? null,
      });
      return "deleted";
    });
  }

  // Save (bookmark) a safe place. Visible-gated via getSafePlace → "not_found"
  // for a missing / soft-deleted place. Idempotent (onConflictDoNothing on the
  // (safe_place_id, user_id) unique). NOT audited — a benign private toggle,
  // exactly like saveEvent.
  async saveSafePlace(
    safePlaceId: string,
    userId: string,
  ): Promise<"ok" | "not_found"> {
    const place = await this.getSafePlace(safePlaceId, userId);
    if (!place) return "not_found";
    await db
      .insert(safePlaceSaves)
      .values({ safePlaceId, userId })
      .onConflictDoNothing();
    return "ok";
  }

  // Unsave. Idempotent — removing a non-existent bookmark is a no-op; always
  // "ok" (you can always drop your own bookmark, even for a since-deleted place).
  // Not audited.
  async unsaveSafePlace(safePlaceId: string, userId: string): Promise<"ok"> {
    await db
      .delete(safePlaceSaves)
      .where(
        and(
          eq(safePlaceSaves.safePlaceId, safePlaceId),
          eq(safePlaceSaves.userId, userId),
        ),
      );
    return "ok";
  }

  // The caller's saved (bookmarked) places, excluding soft-deleted ones, capped.
  // Caller-scoped (a user only ever sees their own saves). Same deterministic
  // order as the list (city, name, id). callerSaved is trivially true here.
  async listSavedSafePlaces(input: {
    callerId: string;
    limit: number;
  }): Promise<SafePlaceReadRow[]> {
    return db
      .select({
        ...this.safePlaceColumns(),
        callerSaved: sql<boolean>`true`,
      })
      .from(safePlaceSaves)
      .innerJoin(safePlaces, eq(safePlaces.id, safePlaceSaves.safePlaceId))
      .where(
        and(
          eq(safePlaceSaves.userId, input.callerId),
          isNull(safePlaces.deletedAt),
        ),
      )
      .orderBy(
        sql`${safePlaces.city} asc nulls last`,
        sql`${safePlaces.name} asc`,
        sql`${safePlaces.id} asc`,
      )
      .limit(input.limit);
  }

  // Bulk-create curated safe places (slice SP-2, the OSM import path). Two dedupe
  // layers: (1) app-level — drop within-request duplicate osmIds (keep first) so
  // one INSERT never carries the same osm_id twice; (2) DB-level — the partial
  // unique index on osm_id + onConflictDoNothing skips venues already imported.
  // Rows with a null osmId (manual/unmatched) always insert. Insert + per-inserted-
  // row safe_place.created audit (IDs-only) commit together (§7). Returns the
  // created count + skipped (requested − created; = within-request + existing dups).
  async bulkCreateSafePlaces(
    rows: {
      name: string;
      category: string;
      description?: string;
      address?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      osmId?: string;
    }[],
    actorId: string,
    ipAddress?: string | null,
  ): Promise<{ created: number; skipped: number }> {
    const requested = rows.length;
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (!r.osmId) return true;
      if (seen.has(r.osmId)) return false;
      seen.add(r.osmId);
      return true;
    });
    if (deduped.length === 0) return { created: 0, skipped: requested };

    const inserted = await db.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(safePlaces)
        .values(
          deduped.map((r) => ({
            name: r.name,
            category: r.category,
            description: r.description ?? null,
            address: r.address ?? null,
            city: r.city ?? null,
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            osmId: r.osmId ?? null,
            createdById: actorId,
          })),
        )
        // Match the PARTIAL unique index predicate; a null osmId never conflicts.
        .onConflictDoNothing({
          target: safePlaces.osmId,
          where: sql`${safePlaces.osmId} is not null`,
        })
        .returning({ id: safePlaces.id });

      if (insertedRows.length) {
        await tx.insert(auditLog).values(
          insertedRows.map((row) => ({
            actorId,
            action: "safe_place.created",
            resourceType: "safe_place" as const,
            resourceId: row.id,
            ipAddress: ipAddress ?? null,
          })),
        );
      }
      return insertedRows;
    });
    return { created: inserted.length, skipped: requested - inserted.length };
  }

  // ── Community membership ────────────────────────────────────────────────────

  async getCommunityMembers(
    communityId: string,
  ): Promise<{ userId: string }[]> {
    return db
      .select({ userId: communityMemberships.userId })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, communityId));
  }
}

// Single shared instance — imported as `storage` everywhere (repository pattern).
export const storage = new DatabaseStorage();
