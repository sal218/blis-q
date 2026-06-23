import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import { generateResetToken, hashResetToken } from "../auth";
import { sendPasswordResetEmail } from "../email";
import {
  registerSchema,
  loginSchema,
  googleSignInSchema,
  resendVerificationSchema,
  passwordResetRequestSchema,
  resetPasswordSchema,
} from "../validation";
import {
  checkSignupRateLimit,
  checkLoginRateLimit,
  checkGoogleAuthRateLimit,
  checkResendVerificationRateLimit,
  checkPasswordResetRateLimit,
} from "../rateLimit";
import type { AccountProfile, SessionResponse } from "@shared/types";

// A reset link is valid for 30 minutes (matches the email copy).
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

// Auth routes (docs/API.md §4). Verification-first: signup never returns a
// session and never reveals whether an email already exists (Article 9 — having
// a Blis-Q account is itself sensitive). Login succeeds only for verified,
// non-deleted accounts, with a single generic failure for everything else.

export function registerAuthRoutes(app: Express): void {
  app.post("/api/v1/auth/signup", handleSignup);
  app.post("/api/v1/auth/login", handleLogin);
  app.post("/api/v1/auth/google", handleGoogleSignIn);
  app.post("/api/v1/auth/resend-verification", handleResendVerification);
  app.post("/api/v1/auth/forgot-password", handleForgotPassword);
  app.post("/api/v1/auth/reset-password", handleResetPassword);
}

// Identical response for new and existing emails — the no-enumeration guarantee.
function accepted(res: Response): Response {
  return res.status(202).json({ ok: true });
}

// Extracts a stable, NON-sensitive code for logging. Raw error objects/messages
// can carry emails, SQL details, or request internals — never log those.
export function safeErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
    if (typeof code === "number") return String(code);
  }
  return "unknown";
}

async function handleSignup(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email, password, displayName, consentedTypes, policyVersion } =
      parsed.data;

    const rate = await checkSignupRateLimit(req);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Existing account → identical 202, no rows, no email. No enumeration.
    const existing = await storage.getUserByEmail(email);
    if (existing) return accepted(res);

    // Create the auth user UNCONFIRMED and WITHOUT sending email — the
    // verification email goes out only after our DB setup succeeds, so a user
    // never gets an email for an account that failed to initialise.
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    });
    if (created.error || !created.data.user) {
      // Likely an existing/orphaned auth user — respond uniformly, never reveal.
      return accepted(res);
    }
    const authUserId = created.data.user.id;

    try {
      await storage.registerUser({
        id: authUserId,
        email,
        displayName,
        consentTypes: consentedTypes,
        policyVersion,
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      });
    } catch (dbErr) {
      // Roll back the auth user so no orphaned account survives (cross-system).
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      console.error(
        "[POST /api/v1/auth/signup] DB transaction failed; rolled back auth user",
        { code: safeErrorCode(dbErr) },
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }

    // DB setup succeeded — now send Supabase's built-in verification email.
    // Non-fatal if delivery fails (the account exists; resend-verification covers it).
    const sent = await supabaseClient.auth.resend({ type: "signup", email });
    if (sent.error) {
      console.error(
        "[POST /api/v1/auth/signup] verification email send failed",
        { code: safeErrorCode(sent.error) },
      );
    }

    return accepted(res);
  } catch (err) {
    console.error("[POST /api/v1/auth/signup] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleResendVerification(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email } = parsed.data;

    const rate = await checkResendVerificationRateLimit(req, email);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Send only for a real, non-deleted account (Supabase no-ops if already
    // verified). Always return the same 202 — never reveal existence.
    const existing = await storage.getUserByEmail(email);
    if (existing && !existing.deletedAt) {
      const sent = await supabaseClient.auth.resend({ type: "signup", email });
      if (sent.error) {
        console.error("[POST /api/v1/auth/resend-verification] send failed", {
          code: safeErrorCode(sent.error),
        });
      }
    }

    return accepted(res);
  } catch (err) {
    console.error("[POST /api/v1/auth/resend-verification] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleLogin(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const rate = await checkLoginRateLimit(req, email);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    const result = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    // Generic failure for bad credentials, nonexistent accounts, AND unverified
    // emails ("Email not confirmed") — no enumeration, no verification hint.
    if (result.error || !result.data.session || !result.data.user) {
      await storage.writeAuditLog({
        action: "user.login_failed",
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const profile = await storage.getAccountProfile(result.data.user.id);
    if (!profile || profile.deletedAt) {
      // Supabase already issued a session before we blocked the login. Revoke
      // it (globally for this user) so it can't be used out-of-band, and audit
      // the blocked attempt with the actor id.
      await supabaseAdmin.auth.admin
        .signOut(result.data.session.access_token, "global")
        .catch(() => {});
      await storage.writeAuditLog({
        action: "user.login_failed",
        actorId: result.data.user.id,
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Banned (suspended) account: the credentials were valid, but the account is
    // blocked. Revoke the session Supabase just issued (so it can't be used
    // out-of-band), audit with the actor id, and return a 403 carrying the stable
    // `account_suspended` code so the client shows the suspension screen (P-20).
    // Suspension is revealed only AFTER valid credentials → no enumeration. The
    // banned state is NOT exposed on the AccountProfile DTO.
    if (profile.bannedAt) {
      await supabaseAdmin.auth.admin
        .signOut(result.data.session.access_token, "global")
        .catch(() => {});
      await storage.writeAuditLog({
        action: "user.login_blocked_suspended",
        actorId: profile.id,
        ipAddress: req.ip ?? null,
      });
      return res
        .status(403)
        .json({ error: "Account suspended", code: "account_suspended" });
    }

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
    console.error("[POST /api/v1/auth/login] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Derive a display name for a first-time Google user from the Google profile
// metadata, falling back to the email local-part and finally a constant. Trimmed
// and capped to the displayName limit so it always satisfies the users column.
function googleDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
  const name = typeof meta.name === "string" ? meta.name : "";
  const localPart = user.email ? user.email.split("@")[0] : "";
  const candidate = (fullName || name || localPart).trim().slice(0, 50);
  return candidate.length > 0 ? candidate : "Blis-Q";
}

// Best-effort rollback of a just-created Supabase auth user when local setup
// can't proceed (missing consent, or a failed DB transaction). Returns true ONLY
// if Supabase confirms the delete. Callers MUST fail closed (500) on false — we
// must never imply (via 422 or a "rolled back" log) that an orphan identity was
// cleaned up when it wasn't. deleteUser can reject (network) or resolve with an
// error; both count as failure. Logs a sanitized code only (never the raw error).
async function deleteAuthUser(authUserId: string): Promise<boolean> {
  try {
    const result = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (result.error) {
      console.error("[POST /api/v1/auth/google] auth-user cleanup failed", {
        code: safeErrorCode(result.error),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[POST /api/v1/auth/google] auth-user cleanup threw", {
      code: safeErrorCode(err),
    });
    return false;
  }
}

// Google Sign-In (docs/API.md §4). Option A: the mobile app sends a Google OIDC
// ID token, which we exchange for a Supabase session via signInWithIdToken —
// Supabase verifies the token against Google and creates/links the auth user.
// A FIRST-TIME user has no local account yet, so we require GDPR consent before
// creating any local rows; until consent arrives we delete the auth user that
// the exchange just created so no orphan identity survives (Codex review).
async function handleGoogleSignIn(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = googleSignInSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { idToken, accessToken, nonce, consentedTypes, policyVersion } =
      parsed.data;

    const rate = await checkGoogleAuthRateLimit(req);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Exchange the Google ID token for a Supabase session. Supabase verifies the
    // token's signature/audience/expiry against Google. access_token and nonce
    // are forwarded only when the client supplied them (native flow variants).
    const result = await supabaseClient.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
      access_token: accessToken,
      nonce,
    });

    // Bad/forged/expired token, or wrong audience → one generic 401, audited.
    if (result.error || !result.data.session || !result.data.user) {
      await storage.writeAuditLog({
        action: "user.login_failed",
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const authUserId = result.data.user.id;
    const email = (result.data.user.email ?? "").toLowerCase();
    const profile = await storage.getAccountProfile(authUserId);

    // Soft-deleted account → block like login does: revoke the session Supabase
    // just issued (so it can't be used out-of-band) and audit with the actor id.
    // We do NOT delete the auth identity here — it's a real, soft-deleted account.
    if (profile && profile.deletedAt) {
      await supabaseAdmin.auth.admin
        .signOut(result.data.session.access_token, "global")
        .catch(() => {});
      await storage.writeAuditLog({
        action: "user.login_failed",
        actorId: authUserId,
        ipAddress: req.ip ?? null,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Banned (suspended) existing account → block like email login does: revoke
    // the just-issued session, audit, and return the suspension code (P-20). A
    // first-time Google user (no profile yet) cannot be banned, so this only
    // applies to an existing resolved profile.
    if (profile && profile.bannedAt) {
      await supabaseAdmin.auth.admin
        .signOut(result.data.session.access_token, "global")
        .catch(() => {});
      await storage.writeAuditLog({
        action: "user.login_blocked_suspended",
        actorId: authUserId,
        ipAddress: req.ip ?? null,
      });
      return res
        .status(403)
        .json({ error: "Account suspended", code: "account_suspended" });
    }

    // First-time Google user — no local account yet.
    if (!profile) {
      // Consent is mandatory before any local record exists (Article 9). Without
      // it, delete the auth user the exchange created (no orphan) and ask the
      // client to re-submit with consent. policyVersion must accompany consent.
      if (!consentedTypes || !policyVersion) {
        // Delete the auth user the exchange created. If cleanup FAILS, an
        // unconsented identity may still exist — fail closed (500) rather than
        // return 422, which would falsely imply the orphan was removed.
        const cleaned = await deleteAuthUser(authUserId);
        if (!cleaned) {
          return res.status(500).json({ error: "Internal Server Error" });
        }
        return res.status(422).json({ error: "consent_required" });
      }
      try {
        await storage.registerUser({
          id: authUserId,
          email,
          displayName: googleDisplayName(result.data.user),
          consentTypes: consentedTypes,
          policyVersion,
          ipAddress: req.ip ?? null,
          userAgent: req.get("user-agent") ?? null,
        });
      } catch (dbErr) {
        // Roll back the auth user so no orphaned account survives (cross-system),
        // exactly as email/password signup does. Log whether the rollback itself
        // succeeded — a failed rollback may leave an orphan we must surface.
        const cleaned = await deleteAuthUser(authUserId);
        console.error(
          "[POST /api/v1/auth/google] DB transaction failed; auth-user rollback " +
            (cleaned ? "succeeded" : "FAILED — orphan auth user may remain"),
          { code: safeErrorCode(dbErr) },
        );
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }

    // Re-read so a freshly created profile is reflected in the response.
    const account = profile ?? (await storage.getAccountProfile(authUserId));
    if (!account) {
      // Never hand back a session without a backing local profile.
      await supabaseAdmin.auth.admin
        .signOut(result.data.session.access_token, "global")
        .catch(() => {});
      return res.status(500).json({ error: "Internal Server Error" });
    }

    const user: AccountProfile = {
      id: account.id,
      email: account.email,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      isPremium: account.isPremium,
      isAdmin: account.isAdmin,
      preferredCity: account.preferredCity,
      createdAt: account.createdAt.toISOString(),
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
    console.error("[POST /api/v1/auth/google] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleForgotPassword(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = passwordResetRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { email } = parsed.data;

    const rate = await checkPasswordResetRateLimit(req, email);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Only act for a real, non-deleted account; always return the same 202 so
    // account existence is never revealed (no enumeration). The raw token only
    // ever exists in the emailed link — the DB stores its hash.
    const existing = await storage.getUserByEmail(email);
    if (existing && !existing.deletedAt) {
      // Invalidate any prior outstanding token so only the newest is usable.
      await storage.invalidatePasswordResetTokensForUser(existing.id);
      const rawToken = generateResetToken();
      await storage.createPasswordResetToken({
        userId: existing.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      const resetLink = `${process.env.WEB_APP_URL ?? ""}/reset-password?token=${rawToken}`;
      try {
        await sendPasswordResetEmail(email, resetLink);
      } catch (mailErr) {
        // Non-fatal — the token is stored; the user can request another.
        console.error("[POST /api/v1/auth/forgot-password] email send failed", {
          code: safeErrorCode(mailErr),
        });
      }
      await storage.writeAuditLog({
        action: "user.password_reset_requested",
        actorId: existing.id,
        ipAddress: req.ip ?? null,
      });
    }

    return accepted(res);
  } catch (err) {
    console.error("[POST /api/v1/auth/forgot-password] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function handleResetPassword(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.issues });
    }
    const { token, newPassword } = parsed.data;

    // IP-only limit on the submit endpoint (token brute-force protection).
    const rate = await checkPasswordResetRateLimit(req);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: "Rate limit exceeded", retryAfter: rate.retryAfter });
    }

    // Atomically consume the token (marks it used iff valid, unexpired, unused,
    // and the user is live). This closes the double-use race and prevents
    // resetting a soft-deleted account. One generic 400 for any failure.
    const consumed = await storage.consumePasswordResetToken(
      hashResetToken(token),
    );
    if (!consumed) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const updated = await supabaseAdmin.auth.admin.updateUserById(
      consumed.userId,
      { password: newPassword },
    );
    if (updated.error) {
      // The token is already consumed; the user requests a new reset link.
      console.error(
        "[POST /api/v1/auth/reset-password] password update failed",
        { code: safeErrorCode(updated.error) },
      );
      return res.status(500).json({ error: "Internal Server Error" });
    }

    await storage.writeAuditLog({
      action: "user.password_reset",
      actorId: consumed.userId,
      ipAddress: req.ip ?? null,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[POST /api/v1/auth/reset-password] unexpected error", {
      code: safeErrorCode(err),
    });
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
