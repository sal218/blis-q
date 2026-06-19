// Safe schema deploy — replaces the old `drizzle-kit push --force`.
//
// WHY THIS EXISTS: `drizzle-kit push` reads RLS as schema drift (Drizzle does
// not manage RLS) and proposes `DISABLE ROW LEVEL SECURITY` on EVERY table.
// With `--force` it applied that with no prompt — silently tearing down the
// zero-policy deny-all firewall (CLAUDE.md §2). This incident happened once on
// prod/test (see docs/DEPLOY.md). This script makes the safe sequence the
// default:
//
//   1. `drizzle-kit push` WITHOUT --force — interactive. Review the diff and
//      apply ONLY additive DDL (new tables/columns/indexes). DECLINE every
//      "DISABLE ROW LEVEL SECURITY" line. (If you accidentally approve one,
//      step 2 repairs it — but decline anyway.)
//   2. Re-apply supabase/rls.sql — idempotent ENABLE RLS on every table,
//      including any just created. Restores the firewall regardless of step 1.
//   3. Verify: every expected table is RLS-enabled with zero policies, else
//      this exits non-zero.
//
// Interactive — for manual deploy by an operator, not CI. Targets DATABASE_URL.
import "dotenv/config";
import { spawnSync } from "node:child_process";

function run(label, cmd, args) {
  console.log(`\n=== ${label} ===`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if ((res.status ?? 1) !== 0) {
    console.error(`\n${label} failed (exit ${res.status}). Aborting deploy.`);
    process.exit(res.status ?? 1);
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

console.log(
  "Safe schema deploy. Review the Drizzle diff and DECLINE any\n" +
    '"DISABLE ROW LEVEL SECURITY" statements — apply additive DDL only.',
);

// 1. Interactive push (NO --force) so RLS-disable lines can be declined.
run("drizzle-kit push (interactive — decline RLS-disable lines)", "npx", [
  "drizzle-kit",
  "push",
]);

// 2. Re-assert RLS (idempotent) — repairs RLS even if step 1 disabled it.
run("re-assert RLS (supabase/rls.sql)", process.execPath, [
  "scripts/db-rls.mjs",
]);

console.log("\nSafe deploy complete — schema applied and RLS verified.");
