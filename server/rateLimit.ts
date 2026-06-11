/**
 * Distributed rate limiting using Upstash Redis.
 *
 * All counters are stored in Redis — shared across all server instances
 * and survive restarts. Falls back to allow-all if Redis is not configured
 * (e.g. test environment).
 *
 * IP extraction relies on Express's req.ip which correctly resolves the
 * real client IP when app.set('trust proxy', 1) is set in index.ts.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

if (!redis) {
  // In production this state is prevented by validateEnv() — the server will
  // not start without UPSTASH_REDIS_REST_URL/TOKEN. In dev/test it is expected
  // and intentional (no Redis infra required locally).
  console.warn(
    "[RateLimit] Upstash Redis not configured — rate limiting disabled (allow all). " +
      "This is expected in dev/test; production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
  );
}

function makeLimiter(
  maxRequests: number,
  window: `${number} ${"ms" | "s" | "m" | "h" | "d"}`,
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, window),
    prefix: "blis-q",
  });
}

// One limiter instance per endpoint type + per identifier type.
// Created once at module load — reused across all requests.
// Auth flows use dual buckets (IP + email) — both must pass. Authenticated
// endpoints are keyed by user ID so each account has its own quota and test
// users never share a bucket. See CLAUDE.md §6 and TRANSFER §3.2 Rule 4.
const limiters = {
  // Auth — dual IP + email buckets
  loginIp: makeLimiter(10, "15 m"),
  loginEmail: makeLimiter(5, "15 m"),
  adminLoginIp: makeLimiter(10, "15 m"), // mirrors login; admin panel is small
  adminLoginEmail: makeLimiter(5, "15 m"),
  signupIp: makeLimiter(5, "1 h"),
  googleAuthIp: makeLimiter(10, "15 m"), // mirrors login IP limit
  passwordResetIp: makeLimiter(5, "15 m"),
  passwordResetEmail: makeLimiter(3, "15 m"),
  resendVerificationIp: makeLimiter(5, "15 m"),
  resendVerificationEmail: makeLimiter(3, "15 m"),

  // Account self-service — keyed by user ID
  accountUpdateUser: makeLimiter(20, "15 m"), // PATCH /profile
  changePasswordUser: makeLimiter(5, "15 m"), // sensitive — tighter

  // Content & community — keyed by user ID
  contentCreateUser: makeLimiter(60, "1 m"), // community posts + chat messages
  reportUser: makeLimiter(10, "1 h"),
  communityJoinUser: makeLimiter(20, "1 h"),
  pushTokenUser: makeLimiter(20, "1 h"), // register/deregister on launch + logout
  exportUser: makeLimiter(5, "10 m"), // GDPR data export — expensive to generate

  // Webhooks — keyed by IP (no authenticated user on a webhook request)
  revenuecatWebhookIp: makeLimiter(20, "1 m"),
};

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

async function check(
  limiter: Ratelimit | null,
  key: string,
): Promise<RateLimitResult> {
  if (!limiter) return { allowed: true };
  try {
    const result = await limiter.limit(key);
    if (result.success) return { allowed: true };
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  } catch {
    // Redis configured but temporarily unavailable — fail closed to prevent
    // abuse during outages. Clients should retry after a short delay.
    return { allowed: false, retryAfter: 60 };
  }
}

function getIp(req: { ip?: string }): string {
  return req.ip || "unknown";
}

// ── Public rate limit functions ───────────────────────────────────────────────

// Auth: BOTH the IP bucket AND the email bucket must pass. Cycling IPs can't
// outrun the per-email limit, and one-account-per-IP can't outrun the per-IP
// limit. See TRANSFER §3.2 Rule 4.
export async function checkLoginRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ipResult = await check(limiters.loginIp, `login:ip:${getIp(req)}`);
  if (!ipResult.allowed) return ipResult;

  if (email) {
    const emailResult = await check(
      limiters.loginEmail,
      `login:email:${email.toLowerCase()}`,
    );
    if (!emailResult.allowed) return emailResult;
  }

  return { allowed: true };
}

export async function checkSignupRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.signupIp, `signup:ip:${getIp(req)}`);
}

// Admin sign-in — dual IP + email buckets, separate from user login so the two
// quotas never interfere. Keyed on its own `admin-login:` namespace.
export async function checkAdminLoginRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ipResult = await check(
    limiters.adminLoginIp,
    `admin-login:ip:${getIp(req)}`,
  );
  if (!ipResult.allowed) return ipResult;

  if (email) {
    const emailResult = await check(
      limiters.adminLoginEmail,
      `admin-login:email:${email.toLowerCase()}`,
    );
    if (!emailResult.allowed) return emailResult;
  }

  return { allowed: true };
}

// Google Sign-In is an auth mutation — rate limited per CLAUDE.md §6. Keyed by
// IP only: the user identity isn't known until Supabase verifies the Google
// OIDC token (signInWithIdToken, Option A).
export async function checkGoogleAuthRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.googleAuthIp, `google-auth:ip:${getIp(req)}`);
}

export async function checkPasswordResetRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ipResult = await check(
    limiters.passwordResetIp,
    `password-reset:ip:${getIp(req)}`,
  );
  if (!ipResult.allowed) return ipResult;

  if (email) {
    const emailResult = await check(
      limiters.passwordResetEmail,
      `password-reset:email:${email.toLowerCase()}`,
    );
    if (!emailResult.allowed) return emailResult;
  }

  return { allowed: true };
}

// Resend verification — like password reset, dual IP + email buckets.
export async function checkResendVerificationRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ipResult = await check(
    limiters.resendVerificationIp,
    `resend-verification:ip:${getIp(req)}`,
  );
  if (!ipResult.allowed) return ipResult;

  if (email) {
    const emailResult = await check(
      limiters.resendVerificationEmail,
      `resend-verification:email:${email.toLowerCase()}`,
    );
    if (!emailResult.allowed) return emailResult;
  }

  return { allowed: true };
}

// Authenticated endpoints — keyed by user ID, not IP.

// Covers community posts and chat messages (the high-frequency content paths).
export async function checkContentCreateRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.contentCreateUser, `content-create:user:${userId}`);
}

export async function checkAccountUpdateRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.accountUpdateUser, `account-update:user:${userId}`);
}

export async function checkChangePasswordRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.changePasswordUser, `change-password:user:${userId}`);
}

export async function checkReportRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.reportUser, `report:user:${userId}`);
}

export async function checkCommunityJoinRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.communityJoinUser, `community-join:user:${userId}`);
}

export async function checkPushTokenRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.pushTokenUser, `push-token:user:${userId}`);
}

export async function checkExportRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.exportUser, `export:user:${userId}`);
}

// Webhooks — keyed by IP (no authenticated user on a webhook request).
export async function checkRevenueCatWebhookRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(
    limiters.revenuecatWebhookIp,
    `revenuecat-webhook:ip:${getIp(req)}`,
  );
}
