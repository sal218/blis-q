import dotenv from "dotenv";

// Integration tests run against the real Blis-Q TEST Supabase project. Its
// credentials live in .env.test (gitignored locally, GitHub Actions secrets in
// CI). NEVER point this at the production database.
dotenv.config({ path: ".env.test" });

// Keep NODE_ENV out of "production" so server-side env validation does not
// demand prod-only secrets (R2, Redis, RevenueCat) during tests.
if (!process.env.NODE_ENV || process.env.NODE_ENV === "production") {
  process.env.NODE_ENV = "test";
}
