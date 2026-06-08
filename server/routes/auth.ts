import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { supabaseClient, supabaseAdmin } from "../supabase";
import {
  registerSchema,
  loginSchema,
  resendVerificationSchema,
} from "../validation";
import {
  checkSignupRateLimit,
  checkLoginRateLimit,
  checkResendVerificationRateLimit,
} from "../rateLimit";
import type { AccountProfile, SessionResponse } from "@shared/types";

// Auth routes (docs/API.md §4). Verification-first: signup never returns a
// session and never reveals whether an email already exists (Article 9 — having
// a Blis-Q account is itself sensitive). Login succeeds only for verified,
// non-deleted accounts, with a single generic failure for everything else.

export function registerAuthRoutes(app: Express): void {
  app.post("/api/v1/auth/signup", handleSignup);
  app.post("/api/v1/auth/login", handleLogin);
  app.post("/api/v1/auth/resend-verification", handleResendVerification);
}

// Identical response for new and existing emails — the no-enumeration guarantee.
function accepted(res: Response): Response {
  return res.status(202).json({ ok: true });
}

// Extracts a stable, NON-sensitive code for logging. Raw error objects/messages
// can carry emails, SQL details, or request internals — never log those.
function safeErrorCode(err: unknown): string {
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
        console.error(
          "[POST /api/v1/auth/resend-verification] send failed",
          { code: safeErrorCode(sent.error) },
        );
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
