/**
 * Startup environment variable validation.
 *
 * Validates all required env vars before the server starts. Calls
 * process.exit(1) with a clear message if anything is missing so a
 * misconfigured deploy fails loudly at startup instead of crashing
 * silently mid-request.
 *
 * Call validateEnv() as the very first thing in server/index.ts.
 */

import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Supabase
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),

  // Session signing (HMAC for invite tokens etc.)
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  // Firebase Admin (Google Sign-In server-side verification)
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .email("FIREBASE_CLIENT_EMAIL must be a valid email"),
  FIREBASE_PRIVATE_KEY: z.string().min(1, "FIREBASE_PRIVATE_KEY is required"),

  // Upstash Redis (rate limiting) — optional in dev/test, required in production.
  // Validated in superRefine below — missing in prod causes a hard startup failure.
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // URLs
  INVITE_LINK_BASE: z.string().url("INVITE_LINK_BASE must be a valid URL"),
  WEB_APP_URL: z.string().url("WEB_APP_URL must be a valid URL"),

  // Admin/moderation dashboard (Vite web app) deployed origin. Optional —
  // used only to add the dashboard to the CORS allowlist in server/index.ts.
  // When unset, the dashboard origin simply isn't allowed cross-origin.
  ADMIN_APP_URL: z.string().url().optional(),

  // Cloudflare R2 (object storage) — optional in local dev, required in
  // production (enforced in superRefine). Four separate private buckets, one
  // per asset type, in an EU-jurisdiction account. See server/objectStorage.ts.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET_AVATARS: z.string().optional(),
  R2_BUCKET_COMMUNITY_IMAGES: z.string().optional(),
  R2_BUCKET_EVENT_IMAGES: z.string().optional(),
  R2_BUCKET_POST_IMAGES: z.string().optional(),

  // RevenueCat webhook — optional in dev/test, required in production.
  // Used to verify the Authorization header on incoming RevenueCat webhooks
  // against req.rawBody. See CLAUDE.md §4.
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Sentry error monitoring — optional in dev. Required before launch as the
  // breach-detection capability (COMPLIANCE_AND_PRIVACY.md §5.7). Intentionally
  // NOT enforced at startup so local dev runs without a Sentry project.
  SENTRY_DSN: z.string().url().optional(),
});

// Vars that are optional locally but MUST be present in production. Missing
// Redis means rate limiting fails open (brute-force exposure); missing R2
// means uploads break; missing RevenueCat secret means webhook signatures
// can't be verified. Fail fast at startup so a misconfigured deploy is
// immediately visible rather than crashing mid-request. See CLAUDE.md §5.
const PRODUCTION_REQUIRED_KEYS: ReadonlyArray<{
  key: keyof z.infer<typeof envSchema>;
  reason: string;
}> = [
  { key: "UPSTASH_REDIS_REST_URL", reason: "rate limiting" },
  { key: "UPSTASH_REDIS_REST_TOKEN", reason: "rate limiting" },
  { key: "R2_ACCOUNT_ID", reason: "object storage" },
  { key: "R2_ACCESS_KEY_ID", reason: "object storage" },
  { key: "R2_SECRET_ACCESS_KEY", reason: "object storage" },
  { key: "R2_ENDPOINT", reason: "object storage" },
  { key: "R2_BUCKET_AVATARS", reason: "object storage" },
  { key: "R2_BUCKET_COMMUNITY_IMAGES", reason: "object storage" },
  { key: "R2_BUCKET_EVENT_IMAGES", reason: "object storage" },
  { key: "R2_BUCKET_POST_IMAGES", reason: "object storage" },
  { key: "REVENUECAT_WEBHOOK_SECRET", reason: "RevenueCat webhooks" },
];

const envSchemaWithRefinements = envSchema.superRefine((data, ctx) => {
  if (process.env.NODE_ENV !== "production") return;

  for (const { key, reason } of PRODUCTION_REQUIRED_KEYS) {
    if (!data[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} is required in production (${reason})`,
        path: [key],
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchemaWithRefinements.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `  ❌ ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    console.error(
      `\n[startup] Server cannot start — missing or invalid environment variables:\n${missing}\n\nCheck your .env file (local) or Fly.io secrets (fly secrets set …) in production.\n`,
    );
    process.exit(1);
  }

  return result.data;
}
