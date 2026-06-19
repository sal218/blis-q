// Read-only RLS verifier (zero-policy model — CLAUDE.md §2).
//
// Asserts, against the database in DATABASE_URL, that every table the project
// expects to exist (1) exists, (2) has ROW LEVEL SECURITY enabled, and (3) has
// ZERO policies. RLS-enabled + zero-policies = deny-all for anon/authenticated;
// the service_role (used by the Express backend) bypasses RLS by design.
//
// The expected-table set is parsed from supabase/rls.sql so this stays in sync
// with the single source of truth — never hardcode the list here.
//
// Exits 0 when the DB matches the model, 1 otherwise. Makes no writes.
//
//   node scripts/check-rls.mjs           # checks DATABASE_URL (.env)
//   DATABASE_URL=<test-url> node scripts/check-rls.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

function expectedTablesFromRlsSql() {
  const sql = readFileSync(
    new URL("../supabase/rls.sql", import.meta.url),
    "utf8",
  );
  const tables = [];
  const re =
    /ALTER\s+TABLE\s+"?([a-z_][a-z0-9_]*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let m;
  while ((m = re.exec(sql)) !== null) tables.push(m[1]);
  return tables;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const expected = expectedTablesFromRlsSql();
  if (expected.length === 0) {
    console.error("No tables parsed from supabase/rls.sql — refusing to pass.");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const problems = [];
  try {
    const { rows: tableRows } = await pool.query(
      `select relname, relrowsecurity
         from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    const byName = new Map(tableRows.map((r) => [r.relname, r.relrowsecurity]));

    for (const t of expected) {
      if (!byName.has(t)) problems.push(`missing table: ${t}`);
      else if (byName.get(t) !== true) problems.push(`RLS DISABLED: ${t}`);
    }

    // Zero-policy rule: no policies anywhere in the public schema.
    const { rows: policyRows } = await pool.query(
      `select schemaname, tablename, policyname
         from pg_policies where schemaname = 'public'`,
    );
    for (const p of policyRows) {
      problems.push(
        `policy present (must be zero): ${p.tablename}.${p.policyname}`,
      );
    }

    const enabled = expected.filter((t) => byName.get(t) === true).length;
    if (problems.length === 0) {
      console.log(
        `RLS OK — ${enabled}/${expected.length} expected tables RLS-enabled, 0 policies.`,
      );
    } else {
      console.error("RLS CHECK FAILED:");
      for (const p of problems) console.error("  - " + p);
    }
  } finally {
    await pool.end();
  }
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("check:rls error —", e.message);
  process.exit(1);
});
