import type { Express, Request, Response } from "express";
import { isAuthenticated, requireAdmin } from "../auth";
import { safeErrorCode } from "./auth";
import { storage } from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import { loginSchema } from "../validation";
import { checkAdminLoginRateLimit } from "../rateLimit";
import type { AccountProfile, SessionResponse } from "@shared/types";

/**
 * Admin / moderation dashboard endpoints (consumed by the Vite web app in
 * admin/). EVERY protected route is gated by isAuthenticated THEN requireAdmin —
 * the order matters, requireAdmin reads req.user populated by isAuthenticated and
 * returns 403 for non-admins. Admin mutations must write an audit_log entry.
 *
 * `POST /api/admin/login` is the one UNauthenticated route here — it IS the auth
 * step. It authenticates via Supabase and gates on isAdmin server-side, so a
 * session is never handed to a non-admin.
 *
 * Routes are added per dashboard feature: reports queue + resolution, safe
 * places CRUD, events management, user moderation (ban/mute), and ad campaigns.
 */
export function registerAdminRoutes(app: Express): void {
  app.post("/api/admin/login", handleAdminLogin);

  // Lightweight identity check — lets the dashboard confirm the signed-in user
  // is a platform admin before rendering. Also exercises the middleware chain.
  app.get(
    "/api/admin/me",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      try {
        return res.json({
          id: req.user!.id,
          displayName: req.user!.displayName,
          isAdmin: req.user!.isAdmin,
        });
      } catch (err) {
        console.error("[GET /api/admin/me]", err);
        return res.status(500).json({ error: "Failed to load admin profile" });
      }
    },
  );
}

// Best-effort revocation of the session Supabase issued before the admin gate
// rejected the user. The session is never returned to the client, so a failure
// here is not a token leak — but the security contract says we revoke it, so a
// failure must be logged (sanitized code only), not swallowed. A rejection OR a
// resolved { error } both count as failure; either way the caller still returns
// the same generic 401.
async function revokeIssuedSession(accessToken: string): Promise<void> {
  try {
    const result = await supabaseAdmin.auth.admin.signOut(accessToken, "global");
    if (result?.error) {
      console.error("[POST /api/admin/login] session revocation failed", {
        code: safeErrorCode(result.error),
      });
    }
  } catch (err) {
    console.error("[POST /api/admin/login] session revocation threw", {
      code: safeErrorCode(err),
    });
  }
}

// Admin email/password sign-in. Authenticates via Supabase, then gates on a
// verified, live, isAdmin profile. Every failure mode — bad credentials,
// unverified email, missing profile, soft-deleted, or non-admin — returns the
// SAME generic 401 so the client can never learn who is an admin. If Supabase
// already issued a session before the admin gate fails, it is revoked (global
// sign-out) so it can't be used out-of-band. Never logs passwords, emails, raw
// Supabase errors, or the request body.
async function handleAdminLogin(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const rate = await checkAdminLoginRateLimit(req, email);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    // Bad credentials / unverified email → generic 401 (no actor known).
    if (result.error || !result.data.session || !result.data.user) {
      await storage.writeAuditLog({
        action: "admin.login_failed",
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const profile = await storage.getAccountProfile(result.data.user.id);

    // Not a live admin (missing / soft-deleted / not isAdmin) → revoke the
    // session Supabase just issued, audit with the actor id, return generic 401.
    if (!profile || profile.deletedAt || !profile.isAdmin) {
      await revokeIssuedSession(result.data.session.access_token);
      await storage.writeAuditLog({
        action: "admin.login_failed",
        actorId: result.data.user.id,
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await storage.writeAuditLog({
      action: "admin.login",
      actorId: profile.id,
      ipAddress: req.ip ?? null,
    });

    const user: AccountProfile = {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      isPremium: profile.isPremium,
      isAdmin: profile.isAdmin,
      preferredCity: profile.preferredCity,
      createdAt: profile.createdAt.toISOString(),
    };
    const body: SessionResponse = {
      user,
      session: {
        accessToken: result.data.session.access_token,
        refreshToken: result.data.session.refresh_token,
        expiresAt: new Date(
          (result.data.session.expires_at ?? 0) * 1000,
        ).toISOString(),
      },
    };
    return res.status(200).json(body);
  } catch (err) {
    console.error("[POST /api/admin/login] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
