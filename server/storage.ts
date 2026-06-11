import { eq, and, inArray, gt, isNull, exists, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  notificationPreferences,
  devicePushTokens,
  communityMemberships,
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

      await tx
        .insert(notificationPreferences)
        .values({ userId: input.id });

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

  // NOTE: there is intentionally NO generic soft-delete/erasure method here.
  // GDPR erasure is a transactional anonymisation cascade (clear PII, content
  // → "[deleted]", drop memberships/RSVPs/tokens/consents, write an audit
  // entry, invalidate the profile cache) and lives in the DELETE /api/account
  // handler (COMPLIANCE §5.2, tracker P-2). A partial "just stamp deletedAt"
  // method would be easy to misuse, so it is not exposed until that flow ships.

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

  async getActiveTokensForUser(
    userId: string,
  ): Promise<{ token: string }[]> {
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
