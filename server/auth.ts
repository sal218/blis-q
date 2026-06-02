import { Request, Response, NextFunction } from "express";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { storage } from "./storage";
import { redis } from "./redis";

// Password reset token utilities — still used for the invite flow.
import * as crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        isPro: boolean;
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
  name: string;
  deleted: boolean;
  isPro: boolean;
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

// Call after any mutation that changes name, email, or deletedAt.
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
async function verifyAndResolve(
  token: string,
): Promise<{ id: string; email: string; name: string; isPro: boolean } | null> {
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

  // Fast path — profile in Redis cache.
  const cached = await getCachedProfile(userId);
  if (cached) {
    if (cached.deleted) return null;
    return {
      id: cached.id,
      email: jwtEmail || cached.email,
      name: cached.name,
      isPro: cached.isPro,
    };
  }

  // Slow path — DB lookup then populate cache.
  const profile = await storage.getUser(userId);
  if (!profile) return null;

  await setCachedProfile({
    id: profile.id,
    email: profile.email,
    name: profile.name,
    deleted: profile.deletedAt !== null,
    isPro: profile.isPro,
  });

  if (profile.deletedAt) return null;

  return {
    id: profile.id,
    email: jwtEmail || profile.email,
    name: profile.name,
    isPro: profile.isPro,
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

  const user = await verifyAndResolve(authHeader.substring(7));

  if (!user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = user;
  next();
}

// Optional auth — does not fail if no token is present.
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const user = await verifyAndResolve(authHeader.substring(7));
    if (user) {
      req.user = user;
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
