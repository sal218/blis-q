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
    prefix: "splitit",
  });
}

// One limiter instance per endpoint type + per identifier type.
// Created once at module load — reused across all requests.
const limiters = {
  loginIp: makeLimiter(10, "15 m"),
  loginEmail: makeLimiter(5, "15 m"),
  signupIp: makeLimiter(5, "1 h"),
  googleAuthIp: makeLimiter(10, "15 m"), // mirrors email login limits
  appleAuthIp: makeLimiter(10, "15 m"),
  resetIp: makeLimiter(5, "15 m"),
  resetEmail: makeLimiter(3, "15 m"),
  resetSubmitIp: makeLimiter(5, "15 m"),
  friendRequestIp: makeLimiter(10, "15 m"),
  convertIp: makeLimiter(30, "5 m"),
  personalExpenseIp: makeLimiter(60, "1 m"), // authenticated; generous but blocks scripted floods
  personalGoalIp: makeLimiter(20, "1 h"),
  pushTokenIp: makeLimiter(20, "1 h"), // called on launch/logout; 20/hr per user is plenty
  groupRecurringIp: makeLimiter(30, "1 h"), // template mutations; generous for normal use
  exportUser: makeLimiter(5, "10 m"), // export generation is expensive; 5 per 10 min per user
  analyticsUser: makeLimiter(30, "1 h"), // analytics aggregation; 30/hr per user
  trajectoryUser: makeLimiter(60, "1 h"), // lightweight read; 60/hr per user
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

export async function checkLoginRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ip = getIp(req);
  const ipResult = await check(limiters.loginIp, `login:ip:${ip}`);
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

export async function checkPasswordResetRateLimit(
  req: { ip?: string },
  email?: string,
): Promise<RateLimitResult> {
  const ip = getIp(req);
  const ipResult = await check(limiters.resetIp, `reset:ip:${ip}`);
  if (!ipResult.allowed) return ipResult;

  if (email) {
    const emailResult = await check(
      limiters.resetEmail,
      `reset:email:${email.toLowerCase()}`,
    );
    if (!emailResult.allowed) return emailResult;
  }

  return { allowed: true };
}

export async function checkResetSubmitRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.resetSubmitIp, `reset-submit:ip:${getIp(req)}`);
}

export async function checkFriendRequestRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.friendRequestIp, `friend-request:ip:${getIp(req)}`);
}

export async function checkConvertRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.convertIp, `convert:ip:${getIp(req)}`);
}

export async function checkGoogleAuthRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.googleAuthIp, `google-auth:ip:${getIp(req)}`);
}

export async function checkAppleAuthRateLimit(req: {
  ip?: string;
}): Promise<RateLimitResult> {
  return check(limiters.appleAuthIp, `apple-auth:ip:${getIp(req)}`);
}

// Authenticated endpoints are keyed by user ID so each account has its own
// quota and test users (each with a unique ID) never share a rate limit bucket.
export async function checkPersonalExpenseRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.personalExpenseIp, `personal-expense:user:${userId}`);
}

export async function checkPersonalGoalRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.personalGoalIp, `personal-goal:user:${userId}`);
}

export async function checkPushTokenRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.pushTokenIp, `push-token:user:${userId}`);
}

export async function checkGroupRecurringRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.groupRecurringIp, `group-recurring:user:${userId}`);
}

export async function checkExportRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.exportUser, `export:user:${userId}`);
}

export async function checkAnalyticsRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.analyticsUser, `analytics:user:${userId}`);
}

export async function checkTrajectoryRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  return check(limiters.trajectoryUser, `trajectory:user:${userId}`);
}
