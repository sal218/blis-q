# Deploy notes

Operational procedures for changes that touch live databases. Pair with
`CLAUDE.md` (security rules + gotchas) and `supabase/rls.sql` (the RLS source of
truth).

---

## Schema changes — the ONLY safe sequence

> **Never run `drizzle-kit push --force`.** It reads RLS as schema drift (Drizzle
> does not manage RLS) and proposes `DISABLE ROW LEVEL SECURITY` on **every**
> table. With `--force` that applies with no prompt — silently tearing down the
> zero-policy deny-all firewall (CLAUDE.md §2). The `db:push` npm script no longer
> uses `--force`.

A schema change is deployed **per environment** (prod, then test) like this:

```bash
# DATABASE_URL must point at the target environment (.env = prod; export the
# test URL for the test project).

npm run db:push      # safe orchestrator: interactive drizzle-kit push (NO --force)
                     #   → review the diff, apply ONLY additive DDL,
                     #     DECLINE every "DISABLE ROW LEVEL SECURITY" line,
                     #   → then auto re-applies supabase/rls.sql and verifies.
```

Or run the steps individually:

```bash
npm run db:diff      # drizzle-kit push (no --force) — review/apply additive DDL only
npm run db:rls       # apply supabase/rls.sql (idempotent ENABLE RLS) + verify
npm run check:rls    # read-only: every expected table RLS-enabled, zero policies
```

**Rules:**

- Apply **additive DDL only** (new tables / columns / indexes). Decline anything
  that disables RLS, drops, or alters destructively.
- **Always** re-run `supabase/rls.sql` after applying DDL — new tables are created
  with RLS _disabled_ by default, so RLS must be re-asserted to cover them.
- **Always** finish with `npm run check:rls` (the orchestrator does this for you).
  It fails if any expected table has RLS disabled or any policy exists.
- `npm run db:push` is **interactive** — for manual operator deploys, not CI.

### `check:rls`

Read-only. Parses the expected-table set from `supabase/rls.sql` (single source
of truth) and asserts each table exists, has RLS enabled, and has zero policies.
It **also fails if any public base table exists that is not listed in
`supabase/rls.sql`** — a table forgotten from `rls.sql` is created RLS-disabled
by default and would otherwise pass silently. (Intentional exceptions go in the
`ALLOWLIST` in `scripts/check-rls.mjs`, currently empty.) Run it any time against
any environment:

```bash
npm run check:rls                          # checks DATABASE_URL (.env / prod)
DATABASE_URL=<test-url> npm run check:rls  # checks the test project
```

---

## Supabase Realtime authorization — `supabase/realtime-auth.sql`

Community chat (P-24a) delivers live messages over the **private** Realtime
channel `chat:{communityId}`. Authorization lives in `supabase/realtime-auth.sql`:
an RLS policy on Supabase's **internal** `realtime.messages` table + a
`SECURITY DEFINER` membership function. This is the one intentional exception to
the zero-policy model — it does **not** touch any app table, so `supabase/rls.sql`
and `npm run check:rls` are unaffected (check:rls only inspects `public` app
tables; `realtime.messages` is correctly outside its scope).

Apply it **per environment**, human-run, **after** `supabase/rls.sql`:

```bash
# DATABASE_URL points at the target environment.
psql "$DATABASE_URL" -f supabase/realtime-auth.sql   # idempotent
```

It is NOT applied by `db:push`/`db:rls` and is NOT managed by Drizzle. Re-run it
whenever the file changes. Requires Supabase Realtime **Authorization** enabled
for the project (private channels).

### Live authorization spike checklist (do before relying on it)

On a dev/test Supabase project with the SQL applied, verify the policy actually
gates subscriptions (it cannot be unit-tested against a live socket without a
real Realtime connection — but the predicate logic itself IS regression-tested in
`server/__tests__/realtime-auth.integration.test.ts`, which calls
`chat_topic_is_member` directly as the `authenticated` role):

1. A **member** of community X can subscribe to `chat:{X}` and receives broadcasts.
2. A **non-member** subscribing to `chat:{X}` is **rejected** (no messages).
3. A member of a **soft-deleted** community (`communities.deleted_at` set) is
   **rejected**.
4. A malformed topic (not `chat:{uuid}`) is **rejected**.
5. **(AUTH-1)** A **banned** member (`users.banned_at` set) is **rejected** — and
   for an already-open pre-ban socket, receiving stops by the next Realtime auth
   check / access-token expiry (instant kill is deferred to P-8).
6. **(AUTH-1)** An **erased** member (`users.deleted_at` set) is **rejected**.

If Realtime Authorization proves unworkable for our model, fall back to a
backend-issued opaque per-membership channel token (tracked under P-24) — weaker
(no live revocation), so private channels are preferred.

---

## Incident log

### 2026-06-18 — Production schema drift + disabled test RLS (repaired)

During the `feat/posts` deploy (adding `idx_posts_community`), running
`drizzle-kit push --force` was caught proposing to `DISABLE ROW LEVEL SECURITY`
on all 16 prod tables. The push was **aborted** before applying. Investigation of
the live databases then found:

- **Prod (`blis-q-prod`)** was **missing the `password_reset_tokens` table**
  entirely — the table was added to the committed Drizzle schema (PR #6, password
  reset) but had never been pushed to prod. The prod password-reset flow would
  have failed at runtime.
- **Test (`blis-q-test`)** had **RLS disabled on all 17 tables** — leftover from a
  past `drizzle-kit push --force` where `supabase/rls.sql` was never re-applied.
  (Integration tests still passed because the test connection uses the privileged
  pooler role, which bypasses RLS.)

**Repair (both applied additively, no destructive changes):**

- Prod: created `idx_posts_community`, created `password_reset_tokens` (+ FK +
  its 2 indexes), re-asserted `supabase/rls.sql`. Verified **17/17 tables
  RLS-enabled, 0 disabled, 0 policies**.
- Test: re-asserted `supabase/rls.sql` → **0 tables RLS-disabled**; index already
  present. Re-ran the posts integration suite (19/19) to confirm RLS-on doesn't
  affect the privileged test connection.

**Root cause:** `drizzle-kit push --force` as the default `db:push`, combined with
RLS being managed outside Drizzle. **Fix:** this document + the neutralized
`db:push` / `db:rls` / `check:rls` scripts (branch `fix/db-push-rls-safety`).

**Follow-up:** prod schema sync had been ad hoc — before launch, do a full
schema-parity pass between the committed Drizzle schema and prod, and run
`npm run check:rls` against prod as part of the launch checklist.
