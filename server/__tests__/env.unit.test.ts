import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "../env";

// Minimal valid base env: all REQUIRED vars present, non-production.
const base: Record<string, string | undefined> = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_ANON_KEY: "anon-key",
  SESSION_SECRET: "x".repeat(32),
  FIREBASE_PROJECT_ID: "proj",
  FIREBASE_CLIENT_EMAIL: "svc@proj.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "key",
  RESEND_API_KEY: "re_test",
  INVITE_LINK_BASE: "http://localhost:5000",
  WEB_APP_URL: "http://localhost:8081",
  NODE_ENV: "test",
};

test("optional env vars that are empty strings are treated as unset", () => {
  const result = parseEnv({
    ...base,
    R2_ENDPOINT: "",
    SENTRY_DSN: "",
    REVENUECAT_WEBHOOK_SECRET: "",
  });

  assert.ok(result.success, "expected parse to succeed");
  assert.equal(result.data.R2_ENDPOINT, undefined);
  assert.equal(result.data.SENTRY_DSN, undefined);
  assert.equal(result.data.REVENUECAT_WEBHOOK_SECRET, undefined);
});

test("a required env var that is an empty string still fails", () => {
  const result = parseEnv({ ...base, DATABASE_URL: "" });
  assert.equal(result.success, false);
});

test("a production-required optional var that is empty still fails in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    // Everything required in production is present EXCEPT an empty Redis URL.
    const result = parseEnv({
      ...base,
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "token",
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "akid",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      R2_BUCKET_AVATARS: "a",
      R2_BUCKET_COMMUNITY_IMAGES: "b",
      R2_BUCKET_EVENT_IMAGES: "c",
      R2_BUCKET_POST_IMAGES: "d",
      REVENUECAT_WEBHOOK_SECRET: "whsec",
    });
    assert.equal(
      result.success,
      false,
      "empty production-required var must still fail in production",
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});
