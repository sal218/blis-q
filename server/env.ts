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

  // Cloudflare R2 (object storage) — optional in local dev, required in production.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),

  // Exchange rates — optional, falls back to hardcoded rates if absent
  EXCHANGE_RATE_API_KEY: z.string().optional(),

  // QR code friend invites — optional. The base URL embedded in QR codes.
  // Defaults to a placeholder; update once the Railway domain is live.
  QR_BASE_URL: z.string().url().optional(),

  // Manual cron trigger secret — required in non-production environments that
  // expose POST /api/dev/trigger-recurring-cron. The route fails closed (401)
  // if this is absent, so omitting it is safe but disables the endpoint.
  CRON_SECRET: z.string().min(1).optional(),

  // RevenueCat webhook — optional in dev/test, required in production.
  // Used to verify the Authorization header on incoming RevenueCat webhooks.
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1).optional(),
});

// In production, rate limiting MUST be backed by Redis. Without it the
// limiters fail-open (allow all), exposing auth endpoints to brute force.
// Fail fast at startup so a misconfigured deploy is immediately visible.
const envSchemaWithRefinements = envSchema.superRefine((data, ctx) => {
  if (process.env.NODE_ENV === "production") {
    if (!data.UPSTASH_REDIS_REST_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "UPSTASH_REDIS_REST_URL is required in production (rate limiting)",
        path: ["UPSTASH_REDIS_REST_URL"],
      });
    }
    if (!data.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "UPSTASH_REDIS_REST_TOKEN is required in production (rate limiting)",
        path: ["UPSTASH_REDIS_REST_TOKEN"],
      });
    }
    if (!data.R2_ACCOUNT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "R2_ACCOUNT_ID is required in production (object storage)",
        path: ["R2_ACCOUNT_ID"],
      });
    }
    if (!data.R2_ACCESS_KEY_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "R2_ACCESS_KEY_ID is required in production (object storage)",
        path: ["R2_ACCESS_KEY_ID"],
      });
    }
    if (!data.R2_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "R2_SECRET_ACCESS_KEY is required in production (object storage)",
        path: ["R2_SECRET_ACCESS_KEY"],
      });
    }
    if (!data.R2_BUCKET_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "R2_BUCKET_NAME is required in production (object storage)",
        path: ["R2_BUCKET_NAME"],
      });
    }
    if (!data.REVENUECAT_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "REVENUECAT_WEBHOOK_SECRET is required in production (RevenueCat webhooks)",
        path: ["REVENUECAT_WEBHOOK_SECRET"],
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
      `\n[startup] Server cannot start — missing or invalid environment variables:\n${missing}\n\nCheck your .env file or Railway environment variables.\n`,
    );
    process.exit(1);
  }

  return result.data;
}
