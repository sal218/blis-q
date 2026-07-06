import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

// CI-only Drizzle config. Identical to drizzle.config.ts EXCEPT `strict: false`,
// which skips drizzle-kit push's "execute these statements?" confirmation prompt.
// The integration CI job builds the schema into a FRESH, empty local Postgres
// container (a big additive CREATE-only diff), so there's nothing to confirm and
// no interactive TTY to answer — `strict: true` would just hang the job.
//
// This does NOT weaken the operator flow: manual `npm run db:push` (db-deploy.mjs)
// still uses drizzle.config.ts (strict: true) so a human reviews/declines any
// RLS-disable line against a REAL DB. This config is only ever passed explicitly
// via `drizzle-kit push --config drizzle.ci.config.ts` in .github/workflows.
// It is NOT `--force` (which also emits DISABLE ROW LEVEL SECURITY — CLAUDE.md
// §2); RLS is re-asserted by scripts/db-rls.mjs immediately after the push.
export default defineConfig({
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: false,
  verbose: true,
});
