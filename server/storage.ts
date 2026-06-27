import {
  eq,
  and,
  or,
  lt,
  inArray,
  notInArray,
  gt,
  isNull,
  isNotNull,
  exists,
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
  safePlaces,
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
      const term = `%${input.search}%`;
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
      input.search ? ilike(communities.name, `%${input.search}%`) : undefined,
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
      input.search ? ilike(communities.name, `%${input.search}%`) : undefined,
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

    const [row] = await db
      .insert(communityMemberships)
      .values({ communityId, userId, role: "member" })
      .onConflictDoNothing()
      .returning({ id: communityMemberships.id });
    if (!row) return "already";

    await db.insert(auditLog).values({
      actorId: userId,
      action: "community.member_joined",
      resourceType: "community",
      resourceId: communityId,
      ipAddress: ipAddress ?? null,
    });
    return "joined";
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

    await db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, userId),
        ),
      );

    await db.insert(auditLog).values({
      actorId: userId,
      action: "community.member_left",
      resourceType: "community",
      resourceId: communityId,
      ipAddress: ipAddress ?? null,
    });
    return "left";
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

    const [row] = await db
      .insert(blocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
      .returning({ id: blocks.id });
    if (!row) return "already";

    await db.insert(auditLog).values({
      actorId: blockerId,
      action: "user.blocked",
      resourceType: "user",
      resourceId: blockedId,
      ipAddress: ipAddress ?? null,
    });
    return "created";
  }

  // Unblock. Idempotent: "removed" when a block existed (audited), "not_blocked"
  // otherwise. Both map to 200 in the route.
  async unblockUser(
    blockerId: string,
    blockedId: string,
    ipAddress?: string | null,
  ): Promise<"removed" | "not_blocked"> {
    const removed = await db
      .delete(blocks)
      .where(
        and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
      )
      .returning({ id: blocks.id });
    if (removed.length === 0) return "not_blocked";

    await db.insert(auditLog).values({
      actorId: blockerId,
      action: "user.unblocked",
      resourceType: "user",
      resourceId: blockedId,
      ipAddress: ipAddress ?? null,
    });
    return "removed";
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
