import {
  eq,
  and,
  inArray,
  gt,
  isNull,
  exists,
  desc,
  count,
  ilike,
} from "drizzle-orm";
import type { MembershipRole } from "@shared/types";
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

      // Anonymise the users row in place (NOT a hard delete).
      await tx
        .update(users)
        .set({
          email: `deleted-${userId}@deleted.invalid`,
          displayName: "[deleted]",
          avatarUrl: null,
          preferredCity: null,
          isPremium: false,
          isAdmin: false,
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
  // was nothing to remove). NOTE: this slice does not protect the last admin —
  // a sole admin can leave and orphan the community; role management lands in a
  // later slice.
  async leaveCommunity(
    communityId: string,
    userId: string,
    ipAddress?: string | null,
  ): Promise<"left" | "not_member" | "not_found"> {
    const [community] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(
        and(eq(communities.id, communityId), isNull(communities.deletedAt)),
      )
      .limit(1);
    if (!community) return "not_found";

    const removed = await db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userId, userId),
        ),
      )
      .returning({ id: communityMemberships.id });
    if (removed.length === 0) return "not_member";

    await db.insert(auditLog).values({
      actorId: userId,
      action: "community.member_left",
      resourceType: "community",
      resourceId: communityId,
      ipAddress: ipAddress ?? null,
    });
    return "left";
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
