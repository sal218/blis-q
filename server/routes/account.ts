import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import { updateProfileSchema, changePasswordSchema } from "../validation";
import {
  checkAccountUpdateRateLimit,
  checkChangePasswordRateLimit,
  checkExportRateLimit,
  checkEraseAccountRateLimit,
} from "../rateLimit";
import type {
  AccountProfile,
  AccountExport,
  ConsentRecordDTO,
  RsvpStatus,
  ReportResourceType,
  SubscriptionStatus,
} from "@shared/types";

// Self-service account management (docs/API.md §5/§6). Every route is
// isAuthenticated — req.user is the caller; a user can only ever read/modify
// their OWN account (the id comes from the verified token, never the body).
// This module covers profile read/update, change-password, consents, and the
// GDPR data export. Erasure (DELETE /account, the anonymisation cascade) ships
// in its own branch.
export function registerAccountRoutes(app: Express): void {
  app.get("/api/v1/profile", isAuthenticated, handleGetProfile);
  app.patch("/api/v1/profile", isAuthenticated, handleUpdateProfile);
  app.post(
    "/api/v1/account/change-password",
    isAuthenticated,
    handleChangePassword,
  );
  app.get("/api/v1/account/consents", isAuthenticated, handleGetConsents);
  app.get("/api/v1/account/export", isAuthenticated, handleExportAccount);
  app.delete("/api/v1/account", isAuthenticated, handleDeleteAccount);
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

// GDPR Art. 17 erasure. Ordering is deliberate (Codex): capture the bearer token
// BEFORE erasure → run the DB anonymisation cascade (which commits the PII
// erasure and invalidates the profile cache) → THEN best-effort Supabase cleanup
// (global sign-out + auth-user delete). Supabase failures are logged (sanitized),
// not fatal: the PII is already erased and the anonymised deletedAt row blocks
// login, so the cleanup is retry-able. Always a generic 200 — leaks nothing.
async function handleDeleteAccount(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkEraseAccountRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Capture the current access token before the account is erased.
    const bearer = extractBearer(req);

    // 1) DB anonymisation cascade (commits PII erasure) + cache invalidation.
    await storage.eraseUser(userId);

    // 2) Best-effort Supabase cleanup AFTER the DB erasure (DB-first).
    if (bearer) {
      const signedOut = await supabaseAdmin.auth.admin
        .signOut(bearer, "global")
        .catch(() => ({ error: { message: "threw" } }));
      if (signedOut?.error) {
        console.error("[DELETE /api/v1/account] session revocation failed", {
          code: safeErrorCode(signedOut.error),
        });
      }
    }
    const deleted = await supabaseAdmin.auth.admin
      .deleteUser(userId)
      .catch(() => ({ error: { message: "threw" } }));
    if (deleted?.error) {
      console.error("[DELETE /api/v1/account] auth-user delete failed", {
        code: safeErrorCode(deleted.error),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/v1/account] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

function toAccountProfile(profile: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPremium: boolean;
  isAdmin: boolean;
  preferredCity: string | null;
  createdAt: Date;
}): AccountProfile {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    isPremium: profile.isPremium,
    isAdmin: profile.isAdmin,
    preferredCity: profile.preferredCity,
    createdAt: profile.createdAt.toISOString(),
  };
}

async function handleGetProfile(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const profile = await storage.getAccountProfile(req.user!.id);
    if (!profile) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(toAccountProfile(profile));
  } catch (err) {
    console.error("[GET /api/v1/profile] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleUpdateProfile(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkAccountUpdateRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }

    // updateUser writes to the users table and invalidates the profile cache
    // (CLAUDE.md §8). Only the validated fields are passed.
    const updated = await storage.updateUser(userId, parsed.data);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    await storage.writeAuditLog({
      action: "user.profile_updated",
      actorId: userId,
      ipAddress: req.ip ?? null,
    });

    // Re-read the narrow account projection for a consistent response shape.
    const profile = await storage.getAccountProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(toAccountProfile(profile));
  } catch (err) {
    console.error("[PATCH /api/v1/profile] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleChangePassword(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkChangePasswordRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { currentPassword, newPassword } = parsed.data;

    const profile = await storage.getAccountProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: "Not found" });
    }

    // Verify the current password. This sign-in creates a Supabase session we
    // must not leave dangling — it is revoked below alongside the user's other
    // sessions once the password changes.
    const verify = await supabaseClient.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });
    if (verify.error || !verify.data.session) {
      await storage.writeAuditLog({
        action: "user.password_change_failed",
        actorId: userId,
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // From here on a real Supabase verification session exists. It MUST be
    // revoked on EVERY exit (even if the update fails), so the cleanup runs in a
    // finally. On success we revoke globally (force re-login everywhere); on
    // failure we revoke only this temporary session (scope: "local"), leaving
    // the user's real sessions intact since nothing changed.
    const verificationToken = verify.data.session.access_token;
    let passwordChanged = false;
    try {
      const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (updated.error) {
        console.error("[POST /api/v1/account/change-password] update failed", {
          code: safeErrorCode(updated.error),
        });
        return res.status(500).json({ error: "Internal Server Error" });
      }
      passwordChanged = true;

      await storage.writeAuditLog({
        action: "user.password_changed",
        actorId: userId,
        ipAddress: req.ip ?? null,
      });

      // Locally-verified access JWTs stay valid until they expire (JWKS, no
      // per-request revocation) — the client should treat a password change as
      // requiring re-login.
      return res.status(200).json({ ok: true });
    } finally {
      await revokeSession(verificationToken, passwordChanged ? "global" : "local");
    }
  } catch (err) {
    console.error("[POST /api/v1/account/change-password] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Best-effort session revocation. `scope: "global"` revokes all of the user's
// refresh sessions; `"local"` revokes only the session of the provided token.
// Reject OR resolved { error } = failure; log a sanitized code only — a revoke
// failure must be observable, not swallowed.
async function revokeSession(
  accessToken: string,
  scope: "global" | "local",
): Promise<void> {
  try {
    const result = await supabaseAdmin.auth.admin.signOut(accessToken, scope);
    if (result?.error) {
      console.error(
        "[POST /api/v1/account/change-password] session revocation failed",
        { code: safeErrorCode(result.error) },
      );
    }
  } catch (err) {
    console.error(
      "[POST /api/v1/account/change-password] session revocation threw",
      { code: safeErrorCode(err) },
    );
  }
}

// GDPR Art. 20 portability: a complete JSON of the caller's data. Scoped to
// req.user.id (the verified token) — never a body param. Soft-deleted content is
// included (flagged). Excludes security/ops artifacts (push tokens, reset-token
// hashes, audit_log) — see docs/API.md §5. The export body is never logged.
async function handleExportAccount(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const userId = req.user!.id;

    const rate = await checkExportRateLimit(userId);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const data = await storage.getAccountExport(userId);
    if (!data.profile) {
      return res.status(404).json({ error: "Not found" });
    }

    const payload: AccountExport = {
      profile: toAccountProfile(data.profile),
      createdAt: data.profile.createdAt.toISOString(),
      communities: data.communities.map((c) => ({
        id: c.id,
        name: c.name,
        joinedAt: c.joinedAt.toISOString(),
      })),
      posts: data.posts.map((p) => ({
        id: p.id,
        communityId: p.communityId,
        content: p.content,
        createdAt: p.createdAt.toISOString(),
        deleted: p.deleted,
      })),
      messages: data.messages.map((m) => ({
        id: m.id,
        communityId: m.communityId,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        deleted: m.deleted,
      })),
      events: data.events.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status as RsvpStatus,
      })),
      consents: data.consents.map((r) => ({
        consentType: r.consentType as ConsentRecordDTO["consentType"],
        policyVersion: r.policyVersion,
        grantedAt: r.grantedAt.toISOString(),
        withdrawnAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null,
      })),
      notificationPreferences: data.notificationPreferences,
      blocks: data.blocks.map((b) => ({
        blockedUserId: b.blockedUserId,
        createdAt: b.createdAt.toISOString(),
      })),
      reports: data.reports.map((r) => ({
        id: r.id,
        resourceType: r.resourceType as ReportResourceType,
        resourceId: r.resourceId,
        reason: r.reason,
        status: r.status as AccountExport["reports"][number]["status"],
        createdAt: r.createdAt.toISOString(),
      })),
      subscription: data.subscription
        ? {
            status: data.subscription.status as SubscriptionStatus,
            productId: data.subscription.productId,
            expiresAt: data.subscription.expiresAt
              ? data.subscription.expiresAt.toISOString()
              : null,
          }
        : null,
    };

    await storage.writeAuditLog({
      action: "user.data_exported",
      actorId: userId,
      ipAddress: req.ip ?? null,
    });

    return res.status(200).json(payload);
  } catch (err) {
    console.error("[GET /api/v1/account/export] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleGetConsents(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const rows = await storage.getConsentRecords(req.user!.id);
    const consents: ConsentRecordDTO[] = rows.map((r) => ({
      consentType: r.consentType as ConsentRecordDTO["consentType"],
      policyVersion: r.policyVersion,
      grantedAt: r.grantedAt.toISOString(),
      withdrawnAt: r.withdrawnAt ? r.withdrawnAt.toISOString() : null,
    }));
    return res.status(200).json(consents);
  } catch (err) {
    console.error("[GET /api/v1/account/consents] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
