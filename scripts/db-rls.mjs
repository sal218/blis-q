// Applies supabase/rls.sql to the database in DATABASE_URL, then verifies the
// zero-policy model holds. supabase/rls.sql is idempotent (ENABLE ROW LEVEL
// SECURITY is safe to run repeatedly), so this is safe to run after any schema
// change to re-assert the deny-all firewall — including on tables just created.
//
// RLS cannot live in the Drizzle schema (Drizzle does not manage it), and
// `drizzle-kit push` actively proposes DISABLING RLS on every table because it
// reads RLS as drift. ALWAYS run this after applying schema DDL. See CLAUDE.md
// §2 and the "db:push / RLS" gotcha.
//
//   node scripts/db-rls.mjs              # applies to DATABASE_URL (.env)
//   DATABASE_URL=<test-url> node scripts/db-rls.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const sql = readFileSync(
    new URL("../supabase/rls.sql", import.meta.url),
    "utf8",
  );

  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(sql);
    console.log("Applied supabase/rls.sql (RLS re-asserted, idempotent).");
  } finally {
    await pool.end();
  }

  // Verify by delegating to the read-only checker (same DATABASE_URL).
  const res = spawnSync(
    process.execPath,
    [new URL("./check-rls.mjs", import.meta.url).pathname],
    { stdio: "inherit", env: process.env },
  );
  process.exit(res.status ?? 1);
}

main().catch((e) => {
  console.error("db:rls error —", e.message);
  process.exit(1);
});
