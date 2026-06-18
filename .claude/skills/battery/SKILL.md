---
name: battery
description: Run the Blis-Q verification gate for the current changes — typecheck, lint, the relevant test suites, changed-file prettier, whitespace, and the right build — auto-detecting scope (server/client/admin/mobile). Use before committing, before a PR, or when the user says "run the battery" / "verify".
---

Run Blis-Q's verification gate. Detect what changed with `git status --short` and
`git --no-pager diff --name-only origin/main...HEAD`, then run ONLY the relevant
checks — but ALWAYS run typecheck + lint. Report each as ✅/❌ with the key
numbers (e.g. "test:client 94/94"). If anything fails, show the failing output
and STOP — do not commit.

Always:
- `npm run check:types`
- `npm run lint`
- changed-file prettier: `npx prettier --check <changed .ts/.tsx/.md/.json>`.
  ⚠️ `.prettierignore` excludes `CLAUDE.md` (hand-maintained) — never reformat it.
- `git diff --check` (CRLF "LF will be replaced" warnings are benign on Windows).

Scope-dependent (run when those files changed):
- `server/**` or `shared/**` → `npm test` (server unit) AND `npm run test:integration`
  (real test DB; needs `.env.test`).
- `client/**` → `npm run test:client`.
- `admin/**` → `cd admin && npm run build`.
- mobile bundling-affecting changes (`client/**`, `app.json`, root `App.tsx`,
  deps) → `npx expo export --platform ios` to confirm the bundle builds.

Reminders:
- CI installs with `npm ci --legacy-peer-deps` on **Node 20**. If you touched
  dependencies, run `npm ci --legacy-peer-deps` locally first to catch lockfile
  drift (CI's npm is stricter than a warm local install).
- This skill verifies; it does not commit or open PRs.
