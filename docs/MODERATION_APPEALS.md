# Account Suspension & Appeals — Design Note

> Plan of record for the suspension/appeals feature. Mirrors the Instagram/Facebook
> shape (clear in-app notice → email at each step → defined appeal path → restore on
> success), adapted to Blis-Q's Article 9 / GDPR constraints. Codex-validated at the
> planning stage. Extends Sprint 4 moderation. Built as **three sequenced slices**
> (P-20 → P-21 → P-22), P-20 first because it needs no schema change.

## Problem

The user-moderation backend shipped in #23 (`users.bannedAt` + the `isAuthenticated`
403 gate + `isAuthenticatedAllowBanned` for export/erasure), and the admin ban/unban
UI shipped in #29. But the **mobile app predates ban**: a suspended user can still log
in (login isn't gated — the gate is on authenticated requests), the app maps the 403
to a generic "coś poszło nie tak" error, and there is no email and no way to appeal.
That is confusing and, for a safety app, a poor and slightly leaky experience.

## What "fixed" looks like (the three moments)

| Moment | Today | Target |
|---|---|---|
| Suspended | Generic error; can still log in | Discreet email + a dedicated in-app **suspension screen** (force-logout of normal nav) |
| Appeal | None | Submit an appeal → moderator reviews → decision |
| Reinstated | Must reload; no signal | Email (+ push later); app recovers on next session |

## ⚠️ Non-obvious constraint: email discretion (Article 9)

Blis-Q account status is itself Article 9 data. A suspension email in a **shared or
monitored inbox** must not out the user. Therefore the suspension/reinstatement emails
are **deliberately content-light**: neutral subject, no sensitive detail, specifics
shown **in-app only after login**. See the exact wording pinned under P-21.

---

## Slice P-20 — Mobile suspension UX (no schema change; ship first)

**Goal:** a banned user gets a clear suspension screen instead of a broken app. No new
tables → not DPIA-gated → unblocked today.

### Backend (additive, non-breaking)
- `server/auth.ts` `isAuthenticated` banned branch (currently
  `return res.status(403).json({ error: "Account suspended" })`, ~line 217) becomes
  **additive**: `{ error: "Account suspended", code: "account_suspended" }`. The
  `error` string is unchanged for backward compatibility; `code` is the new stable,
  machine-readable discriminator.
- `docs/API.md` error-envelope section documents the `account_suspended` code on the
  403 for authenticated routes.
- **Update** the existing assertion in
  `server/__tests__/auth-ban-gate.integration.test.ts` (~line 81) to expect the new
  body, and assert export/erasure stay reachable for a banned user (unchanged).

### Client
- `client/lib/api/http.ts` currently maps non-2xx on **status only**. Add a 403 branch
  that inspects the body for `code === "account_suspended"` and surfaces a distinct
  `suspended` error kind (a small, contained addition to the shared error mapping — not
  a rewrite).
- App-wide handling: when a request returns `suspended`, route to a dedicated
  **Suspension screen** and force-logout of the normal tab/stack tree (the session is
  cleared the same way logout does — including push-token deregistration order per the
  CLAUDE.md gotcha).
- **Suspension screen** (Polish, calm, non-shaming): explains the account is suspended,
  shows a **contact/email "appeal" link** (the v1 appeal channel — no appeals backend
  yet), and surfaces the **Export data** and **Delete account** actions (still reachable
  via `isAuthenticatedAllowBanned`).

### Tests
- Server: banned 403 carries `code: "account_suspended"`; export + erasure remain
  reachable for a banned user.
- Client (jest-expo): the `http` mapper returns the `suspended` kind for a 403 with that
  code (and *not* for a generic 403); the app routes to the suspension screen on
  `suspended`.

### Human gate
UI slice → device test (banned account → suspension screen renders, export/delete
reachable, appeal link works) before PR.

---

## Slice P-21 — Ban reason + suspension/reinstatement emails (DPIA-gated)

**Goal:** the admin records *why* on ban, and the user is notified (discreetly).

### Schema — new table `moderation_actions` (DPIA-gated)
- Columns: `id`, `targetUserId` (→ `users.id`), `actorId` (→ `users.id`, the admin),
  `actionType` (`ban` | `unban`), `reasonCategory` (enum, **ban only**), `createdAt`.
- **Explicit `ON DELETE`** in the migration. We anonymise users in place (we do not hard
  delete), so the FK cascade never fires — the **manual** erasure cascade owns cleanup
  (see below). Define FKs as `ON DELETE SET NULL` for `actorId` and `ON DELETE CASCADE`
  for `targetUserId` as a backstop, but the erasure handler is authoritative.
- **RLS:** add `ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;` to
  `supabase/rls.sql` (the list currently ends at `password_reset_tokens`). New Drizzle
  tables are created **RLS-disabled**, so `rls.sql` must be re-run after `db:push`. Deploy
  via the safe sequence in `docs/DEPLOY.md`: `db:push` (apply additive DDL, decline any
  RLS-disable line) → re-apply `rls.sql` → `check:rls`. Schema is **not finalised until
  the DPIA covers this table** (COMPLIANCE §4).

### `reasonCategory` enum — coarse, behaviour-based, **never protected-class**
Proposed default (final list is the **client's** moderation-policy call):
`spam`, `harassment`, `hate_speech`, `impersonation`, `safety_threat`,
`explicit_content`, `terms_violation`, `other`.
**No free-text moderator note in v1** — a free-text note about an Article 9 user is
exactly what the DPIA should rule on; defer it. `reasonCategory` is stored **only** in
`moderation_actions`, **never** in `audit_log` (audit metadata is IDs-only, per the
brief / COMPLIANCE §audit).

### Backend
- `banUser` / `unbanUser` in `server/storage.ts` (guarded `UPDATE … WHERE` tx at ~349)
  extend to write the `moderation_actions` row **in the same `db.transaction`** as the
  `bannedAt` write + the `audit_log` row, then `invalidateProfileCache`.
- Admin ban endpoint gains a Zod-validated `reasonCategory` (enum, required on ban).
- **Email is post-commit + best-effort** — modelled on the post-create notification in
  `server/routes/posts.ts` (~130). An email failure must **not** fail or roll back the
  ban. Add a test for that.

### Email discretion (pin the wording)
- Sender: brand display name only (the existing `Blis-Q <…>` in `server/email.ts` — the
  brand name is neutral). **Subject: "Aktualizacja Twojego konta"** (*An update about
  your account*).
- Suspension body (minimal): *"Status Twojego konta uległ zmianie. Otwórz aplikację, aby
  zobaczyć szczegóły."* (*Your account status has changed. Open the app to see details.*)
  — **no** reason, **no** sensitive detail.
- Reinstatement body: *"Twoje konto jest ponownie aktywne."* (*Your account is active
  again.*)
- **Delivery gate:** real sends to users are **blocked until the Resend custom domain is
  verified** (Week 0 / tracker P-6) — `onboarding@resend.dev` only delivers to the Resend
  account owner. Build templates + send path now; user delivery follows the domain.

### Erasure / export (must be explicit — Codex P1)
- **Erasure** (`DELETE /api/account`, the manual cascade in `server/storage.ts` ~710):
  `DELETE FROM moderation_actions WHERE target_user_id = :uid` (it is the erased user's
  personal data; the anonymised event trail already lives in `audit_log` with IDs
  scrubbed), and `UPDATE moderation_actions SET actor_id = NULL WHERE actor_id = :uid`
  (if an erased user was the acting admin).
- **Export** (`GET /api/account/export`): include the user's own `moderation_actions` as
  *target* — `actionType`, `reasonCategory`, `createdAt` only. **Exclude `actorId`** (a
  different person's identity).

### Tests
Transactional ban+action+audit (all-or-nothing); best-effort email failure does **not**
fail the ban; `reasonCategory` enum validation (400 on bad value); cache invalidation;
erasure deletes the target's `moderation_actions` + nulls actor; export includes them
without `actorId`.

---

## Slice P-22 — Full in-app appeals (DPIA-gated; depends on P-20 + P-21)

**Goal:** a suspended user can contest the ban in-app; the moderator reviews and the
account is restored on success.

### Schema — new table `appeals` (DPIA-gated)
- Columns: `id`, `userId`, `moderationActionId`, `status`
  (`open` | `reviewing` | `granted` | `upheld`), `message` (Zod-bounded user text),
  `reviewedById`, `reviewedAt`, `createdAt`.
- **Exact `ON DELETE` per FK** (per the per-table rule, COMPLIANCE §5.2; the manual
  erasure cascade is authoritative — FK behaviour is the backstop):
  - `userId` → `users.id` **`ON DELETE CASCADE`** — an appeal is the user's own data
    (and its `message` is free-text PII); if the user row is ever hard-deleted the
    appeal goes with it. The manual erasure path `DELETE`s the user's appeals explicitly.
  - `reviewedById` → `users.id` **`ON DELETE SET NULL`** — preserve the appeal record if
    the reviewing admin is later erased; the manual erasure path nulls it.
  - `moderationActionId` → `moderation_actions.id` **`ON DELETE CASCADE`** — an appeal is
    meaningless without the action it contests; erasing the target user deletes both that
    user's `moderation_actions` and their `appeals` together, so this is consistent.
- **One active appeal per user — DB-level guard (not read-before-insert):** a **partial
  unique index** `CREATE UNIQUE INDEX … ON appeals (user_id) WHERE status IN ('open','reviewing')`.
  Two concurrent `POST`s cannot both insert — the second hits a unique violation, caught
  and returned as a deterministic **409 with no second row**. (Express via Drizzle; mirror
  the guarded-transition pattern used for ban/unban in `server/storage.ts`.)
- **RLS:** add `ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;` to `supabase/rls.sql`;
  same DPIA-gated `db:push → rls → check:rls` deploy as P-21.

### Backend
- `POST /api/v1/account/appeal` — banned user via `isAuthenticatedAllowBanned`;
  **rate-limited** (fail-closed limiter); Zod-bounded `message`; **one active appeal per
  user enforced by the partial unique index above** (duplicate / double-tap → 409, no
  second row). `GET /api/v1/account/appeal` — the user's appeal status.
- Admin: `GET /admin/appeals` (queue, same offset/filter pattern as the Reports page);
  `POST /admin/appeals/:id/decision` `{ decision: "grant" | "uphold" }` — a **guarded
  transactional state transition** (`UPDATE … WHERE status IN ('open','reviewing')`):
  `grant` → set status + **unban** (reuse `unbanUser`) + audit + reinstatement email;
  `uphold` → set status + audit + decision email. Idempotent: a second decision on an
  already-decided appeal returns 409.

### Mobile / Admin
- Mobile: appeal **form + status** on the suspension screen (replaces the v1 email link).
- Admin web: **Appeals** queue page — same `DataTable` / per-row `Set` busy / reload-after-
  action pattern as `ReportsPage.tsx` / `UsersPage.tsx`.

### Reinstatement notification
Email now (per P-21). The `moderation_action` **push** is already a Sprint 6 roadmap item
— defer push to there.

### Erasure / export (explicit)
- **Erasure:** `DELETE FROM appeals WHERE user_id = :uid` (the `message` is the user's
  free-text PII → delete, don't anonymise); `UPDATE appeals SET reviewed_by_id = NULL
  WHERE reviewed_by_id = :uid`.
- **Export:** include the user's own appeals — `message`, `status`, `createdAt`,
  `reviewedAt` (exclude `reviewedById`).

### Tests
Appeal submit (banned-only; rate-limit 429; validation 400; one-open-appeal guard 409);
status read; admin decision (`grant` unbans + guarded transition + audit; `uphold` audits;
409 on re-decide); export includes appeals; erasure deletes them + nulls reviewer.

---

## Cross-cutting decisions

| # | Decision | Default | Owner |
|---|---|---|---|
| 1 | v1 appeal channel | Email link first (P-20), full in-app later (P-22) | PGC |
| 2 | `reasonCategory` enum | The 8 coarse, behaviour-based categories above | **🏢 Client** (moderation policy) |
| 3 | Appeal window + response SLA | e.g. 30 days to appeal, best-effort review | **🏢 Client** (moderation policy) |
| 4 | Email discretion wording | Neutral subject/body, detail in-app only | 🏢 Client sign-off; PGC drafts |
| 5 | Ban-reason free text | Deferred post-DPIA (category-only v1) | DPIA / 🏢 Client |
| 6 | Reinstatement notify | Email now, push later (Sprint 6) | PGC |

## Blockers

- **Resend verified domain** (Week 0 / P-6) — gates real suspension/reinstatement email
  delivery. Templates + send path are built regardless.
- **DPIA** — `moderation_actions` and `appeals` are new Article-9-adjacent tables; per
  COMPLIANCE §4 the schema is not finalised pre-DPIA. **P-20 is schema-free and goes
  first**; P-21/P-22 schema lands after the DPIA covers them.
