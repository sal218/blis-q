import { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { storage } from "./storage";
import { redis } from "./redis";

// Password reset token utilities — still used for the invite flow.
import * as crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      // displayName is the public alias (Blis-Q anonymity model) — never the
      // user's real name. email is for account management only, never shown to
      // other users. isAdmin gates the admin/moderation dashboard routes.
      user?: {
        id: string;
        email: string;
        displayName: string;
        isPremium: boolean;
        isAdmin: boolean;
        // Moderation suspension. The user is still resolved (so GDPR
        // export/erasure stay reachable); isAuthenticated returns 403 for them.
        banned: boolean;
      };
    }
  }
}

// Lazily created so SUPABASE_URL is read at first request, not at import time.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error("SUPABASE_URL is not set");
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

// Minimal fields the auth middleware needs — not a full user row.
type CachedProfile = {
  id: string;
  email: string; // DB email; JWT email is layered on top at read time
  displayName: string;
  deleted: boolean;
  banned: boolean;
  isPremium: boolean;
  isAdmin: boolean;
};

const PROFILE_CACHE_TTL = 60; // seconds
const profileCacheKey = (userId: string) => `profile:${userId}`;

async function getCachedProfile(userId: string): Promise<CachedProfile | null> {
  if (!redis) return null;
  try {
    return await redis.get<CachedProfile>(profileCacheKey(userId));
  } catch {
    return null;
  }
}

async function setCachedProfile(profile: CachedProfile): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(profileCacheKey(profile.id), profile, {
      ex: PROFILE_CACHE_TTL,
    });
  } catch {
    // ignore cache write errors — auth still succeeds via DB
  }
}

/**
 * Invalidate the Redis profile cache for a user.
 *
 * MUST be called after ANY mutation to the `users` table — displayName, email,
 * deletedAt, isPremium, isAdmin, or preference changes. The two-tier auth cache
 * (Redis profile cache, PROFILE_CACHE_TTL seconds) otherwise keeps serving a
 * stale identity for up to that window after the write. The account-deletion
 * endpoint must call this before returning. See CLAUDE.md §8.
 */
export async function invalidateProfileCache(userId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(profileCacheKey(userId));
  } catch {
    // ignore
  }
}

// Call once at server startup to surface missing Supabase config immediately.
export function validateAuthConfig(): void {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Required environment variables are not set: ${missing.join(", ")}`,
    );
  }
}

// Verifies the JWT locally (no Supabase network call) then resolves the user
// profile, using Redis as a 60-second cache to skip the DB hop.
async function verifyAndResolve(token: string): Promise<{
  id: string;
  email: string;
  displayName: string;
  isPremium: boolean;
  isAdmin: boolean;
  banned: boolean;
} | null> {
  const supabaseUrl = process.env.SUPABASE_URL!;

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    const result = await jwtVerify(token, getJWKS(), {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated",
      algorithms: ["ES256"],
    });
    payload = result.payload;
  } catch {
    // JWT is invalid, expired, or signed with an unknown key — fail closed.
    return null;
  }

  const userId = payload.sub;
  if (!userId) return null;

  const jwtEmail = (payload["email"] as string | undefined) ?? "";

  // Fast path — profile in Redis cache. Banned users are still RESOLVED (with
  // the banned flag) so GDPR export/erasure stay reachable; isAuthenticated does
  // the 403. Only deleted (erased) accounts resolve to null.
  const cached = await getCachedProfile(userId);
  if (cached) {
    if (cached.deleted) return null;
    return {
      id: cached.id,
      email: jwtEmail || cached.email,
      displayName: cached.displayName,
      isPremium: cached.isPremium,
      isAdmin: cached.isAdmin,
      banned: cached.banned,
    };
  }

  // Slow path — DB lookup then populate cache.
  const profile = await storage.getUser(userId);
  if (!profile) return null;

  await setCachedProfile({
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    deleted: profile.deletedAt !== null,
    banned: profile.bannedAt !== null,
    isPremium: profile.isPremium,
    isAdmin: profile.isAdmin,
  });

  if (profile.deletedAt) return null;

  return {
    id: profile.id,
    email: jwtEmail || profile.email,
    displayName: profile.displayName,
    isPremium: profile.isPremium,
    isAdmin: profile.isAdmin,
    banned: profile.bannedAt !== null,
  };
}

// Lightweight JWT-only identity resolution — no DB lookup, no cache.
// Use this on optional-auth routes that only need the caller's user ID.
export async function resolveUserIdFromToken(
  token: string,
): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL!;
  try {
    const result = await jwtVerify(token, getJWKS(), {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: "authenticated",
      algorithms: ["ES256"],
    });
    return result.payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function isAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await verifyAndResolve(authHeader.substring(7));
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    // Banned (suspended) accounts are resolved but blocked here. GDPR
    // export/erasure routes use isAuthenticatedAllowBanned to stay reachable.
    if (user.banned) {
      return res.status(403).json({ error: "Account suspended" });
    }
    req.user = user;
    next();
  } catch (err) {
    // Fail closed: an unexpected error during verification (DB/cache/JWKS
    // outage) must never grant access. Express 4 does not route rejected
    // promises from async middleware to the error handler, so catch here.
    console.error("[auth] isAuthenticated error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Like isAuthenticated, but does NOT block banned (suspended) accounts — it only
 * rejects missing/invalid tokens and erased accounts. Used ONLY on the GDPR
 * data-subject-rights routes (account export, account erasure) so a suspended
 * user can still exercise Art. 20 / Art. 17 rights. Do not use elsewhere.
 */
export async function isAuthenticatedAllowBanned(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await verifyAndResolve(authHeader.substring(7));
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error("[auth] isAuthenticatedAllowBanned error", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Gate a route to platform admins (the admin/moderation dashboard).
 *
 * MUST run AFTER isAuthenticated in the middleware chain — it relies on
 * req.user being populated (isAdmin is read from the profile cache, so no
 * extra DB hit). Returns 403 for authenticated non-admins. Admin mutations
 * should additionally be recorded in audit_log by the route handler.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// Optional auth — does not fail if no token is present.
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const user = await verifyAndResolve(authHeader.substring(7));
      if (user) {
        req.user = user;
      }
    } catch (err) {
      // Optional auth — on any error just proceed unauthenticated.
      console.error("[auth] optionalAuth error", err);
    }
  }

  next();
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
