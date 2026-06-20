# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-20 — user ban/unban (#23) merged + prod `users.banned_at` applied; Sprint-4 backend complete. Next: mobile posts UI + safety features (UI — device-tested before PR)._

## Current phase

**Sprint 4 — Community posts + moderation (ROADMAP Sprint 4). Sprint 3 done. Backend slices all merged: posts (#19), db:push/RLS hardening (#20), /autoslice skill (#21), moderation actions (#22), user ban/unban (#23). Next: mobile posts UI + safety features (both UI — `/autoslice` reviews the code but stops at the human gate for device testing before PR), plus a chore to tune `/autoslice` (synchronous Codex review).**

## Merged to `main`

| PR  | What                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | Scaffold (12 Even Tab files adapted + fresh infra/config)                                                                                                                                                                                                                                                                                                                                                         |
| #2  | `docs/ROADMAP.md` (6-month plan)                                                                                                                                                                                                                                                                                                                                                                                  |
| #3  | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas                                                                                                                                                                                                                                                                                                                                                   |
| #4  | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test                                                                                                                                                                                                                                                                                                  |
| #5  | `fix/env-empty-string` — empty optional env vars treated as unset                                                                                                                                                                                                                                                                                                                                                 |
| #6  | `feat/auth-password-reset` — atomic single-use expiring reset tokens, no enumeration, audit                                                                                                                                                                                                                                                                                                                       |
| #7  | `feat/auth-google` — Google sign-in (Supabase `signInWithIdToken`, Option A); consent on first sign-up, fail-closed cleanup; +`forceExit` CI fix                                                                                                                                                                                                                                                                  |
| #8  | `feat/auth-screens-mobile` — end-to-end mobile auth UI (Polish/LTR), Google consent retry, SecureStore session, push-deregister on logout, jest-expo harness                                                                                                                                                                                                                                                      |
| #9  | `feat/admin-login` — real admin email/password sign-in (`POST /api/admin/login`, server-side `isAdmin` gate, generic 401, session revoke + sanitized logging, audit)                                                                                                                                                                                                                                              |
| #10 | `feat/account-profile` — Sprint-2 slice 1: `GET/PATCH /api/v1/profile`, `POST /account/change-password` (verification-session revoked on every exit), `GET /account/consents`; closes the P-1 "no GET /me" gap                                                                                                                                                                                                    |
| #11 | `feat/account-export` — Sprint-2 slice 2: `GET /api/v1/account/export` (GDPR Art. 20); expanded shape (notif prefs, blocks, reports, subscription), soft-deleted incl., security exclusions documented                                                                                                                                                                                                            |
| #12 | `feat/account-erasure` — Sprint-2 slice 3: `DELETE /api/v1/account` (GDPR Art. 17) anonymisation cascade across every table; **closes P-1/P-2**                                                                                                                                                                                                                                                                   |
| #13 | `feat/communities` — Sprint-3 slice 1: communities create/browse/get/join/leave, creator→admin, last-admin-leave guard (409), audited                                                                                                                                                                                                                                                                             |
| #14 | `feat/block-reports` — Sprint-3 slice 2: blocks (block/unblock/list, idempotent, soft-deleted unavailable) + `POST /reports`; block-only (mute deferred); audited                                                                                                                                                                                                                                                 |
| #15 | `feat/theme-foundation` — Sprint-3 mobile PR 1: light/dark theme (`ThemeContext`, SecureStore-persisted, default dark) + ~20-file `useTheme()` migration + authenticated tab shell; `HomePlaceholder` removed                                                                                                                                                                                                     |
| #16 | `feat/communities-mobile` — Sprint-3 mobile PR 2: communities browse/detail/create + blocked-users under Events tab; login-first redesign + sun/moon toggle; SDK-54 dep alignment + Expo entry fixes                                                                                                                                                                                                              |
| #17 | `feat/admin-communities` — Sprint-3 admin slice: admin communities CRUD (`GET/POST /admin/communities`, `GET/PATCH/DELETE /:id`, transactional update/soft-delete) + read-only `GET /admin/reports`; admin web Communities page + Reports queue                                                                                                                                                                   |
| #19 | `feat/posts` — Sprint-4 slice 1: community posts CRUD + report (backend-only, text-only). Cursor-paged feed, member-gated create, block filtering, transactional+audited mutations, DELETE scrubs stored content, defensive cursor, best-effort `new_community_post` push, `idx_posts_community`. 19 integration tests                                                                                            |
| #20 | `fix/db-push-rls-safety` — neutralized `db:push --force` (proposed disabling RLS on every prod table) → safe interactive orchestrator; added `db:rls` + read-only `check:rls` (fails on unlisted public tables); `docs/DEPLOY.md` + incident log. Repaired prod (missing `password_reset_tokens`) + test (RLS disabled on all tables)                                                                             |
| #21 | `chore/autoslice-skill` — `/autoslice` skill: automated Claude↔Codex review loop (plan + working-tree review via the `codex:codex-rescue` subagent, round caps, human gate before PR) + frozen `CODEX_REVIEWER_BRIEF.md`                                                                                                                                                                                          |
| #22 | `feat/moderation-actions` — Sprint-4 admin moderation: `PATCH /admin/reports/:id` (resolve/dismiss, atomic one-way, `AdminReportDTO`) + `POST /admin/moderation/remove-content` (post-only, scrub+audit) + admin reports list → `AdminReportDTO`. 13 integration tests                                                                                                                                            |
| #23 | `feat/user-ban` — Sprint-4 P-15: admin ban/unban + user directory + auth-gate (banned → 403; GDPR export/erasure stay reachable via `isAuthenticatedAllowBanned`) + erasure cascade (clears `bannedAt`, anonymises user-targeted audit `resourceId`). `users.banned_at` additive column. First `/autoslice` run. 27 focused tests. **Prod `users.banned_at` applied + `check:rls` verified (17/17, 0 policies).** |

**🎉 Sprint-1 auth scope complete** (backend auth #4/#6/#7, mobile auth UI #8, admin sign-in #9). **🎉 Sprint-2 account/GDPR complete** (profile #10, export #11, erasure #12 — P-1/P-2 closed). **🎉 Sprint-3 complete** (communities #13, block/reports #14, theme #15, communities/login mobile #16, admin slice #17). **🎉 Sprint-4 backend complete** (posts #19, db:push/RLS hardening #20, /autoslice #21, moderation actions #22, user ban/unban #23 — all merged).

## In progress

- _(nothing in flight — between slices.)_ Next: Sprint-4 **mobile posts UI** + **safety features** (both UI — `/autoslice` reviews the code but stops at the human gate for Expo/device testing before PR), plus a small chore to tune `/autoslice` (synchronous Codex review).
- **Backlog (Codex):** "Deactivate account" = a **reversible pause** (not GDPR erasure) — parked in [ROADMAP](ROADMAP.md) **Sprint 4**.

## Auth endpoints live (`/api/v1/auth/*`)

`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Account (🔑): `GET/PATCH /api/v1/profile` · `POST /api/v1/account/change-password` · `GET /api/v1/account/consents` (merged #10) · `GET /api/v1/account/export` (merged #11) · `DELETE /api/v1/account` (merged #12). **Account/GDPR surface complete.**
Communities (🔑, merged #13): `POST /api/v1/communities` · `GET /api/v1/communities` · `GET /:id` · `POST /:id/join` · `DELETE /:id/leave`.
Posts (🔑, merged #19): `GET /api/v1/communities/:id/posts` · `POST /api/v1/communities/:id/posts` · `GET /api/v1/posts/:id` · `DELETE /api/v1/posts/:id` · `POST /api/v1/posts/:id/report`.
Safety (🔑, merged #14): `POST /api/v1/blocks` · `DELETE /api/v1/blocks/:userId` · `GET /api/v1/blocks` · `POST /api/v1/reports`.
Admin (🛡️ `isAuthenticated → requireAdmin`): **`POST /api/admin/login`** (#9, merged) + `GET /api/admin/me`. **`feat/admin-communities`:** `GET/POST /api/admin/communities` · `GET/PATCH/DELETE /api/admin/communities/:id` · `GET /api/admin/reports` (read-only). **`feat/moderation-actions`:** `PATCH /api/admin/reports/:id` (resolve/dismiss) · `POST /api/admin/moderation/remove-content` (post-only). **`feat/user-ban`:** `GET /api/admin/users` · `GET /api/admin/users/:id` · `POST /api/admin/moderation/ban` · `POST /api/admin/moderation/unban`. Paths stay under `/api/admin/*` (→ `/api/v1/admin/*` migration tracked).

## Sprint status

Sprint 1 (auth) ✅ · Sprint 2 (account/GDPR, P-1/P-2 closed) ✅ · Sprint 3 (communities → block/reports → mobile → admin) ✅. **Now in Sprint 4** (posts → moderation actions → safety) per [ROADMAP](ROADMAP.md).

## Infrastructure

| Service                                                                      | Status                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Supabase **prod** (`blis-q-prod`, Frankfurt)                                 | live — 17 tables, RLS-on, Data API off                                     |
| Supabase **test** (`blis-q-test`, Frankfurt)                                 | live — CI integration DB; `BLISQ_TEST_*` secrets set                       |
| Firebase (`Blis-Q`)                                                          | live — Google provider + service account (server creds in `.env`)          |
| Upstash Redis / Cloudflare R2 / Resend domain / Fly.io / Sentry / RevenueCat | **not yet** (deferred; Fly/Sentry later, rest at the provisioning cutover) |

All infra is under the `blisqadmin@gmail.com` project account (PGC-owned) — **transfer ownership to the client before real users** (see ROADMAP Week-0 + the provisioning-cutover plan).

## Known follow-ups (CLAUDE.md issue tracker)

- **P-1/P-2** ✅ **closed** (before real users): GDPR registration consent (#4), profile/`GET me` (#10), export (#11, Art. 20), erasure (#12, Art. 17). The account is fully manageable, exportable, and erasable.
- **P-3** (🟠 blocker, before payments): RevenueCat webhook.
- **P-6**: branded Resend email (currently Supabase built-in).
- **P-7**: Drizzle `pgTable` extra-config deprecation sweep.
- **P-8** (before beta): force-logout other sessions on password reset.
- **P-9**: ✅ addressed in this branch (reset deep-link token captured + scrubbed from nav/web state, never logged); re-verify when universal/App Links land.
- **P-10** (before beta): mobile token refresh not wired (refresh token stored but unused).

## ⛔ Remaining blockers (must clear before beta / real users / launch)

Tracked here so they stay explicit (per Codex), not just implied by the roadmap.

**Code / engineering (PGC):**

- 🔴 **GDPR erasure + export** (P-1/P-2) — export `GET /api/account/export` ✅ merged (#11); erasure `DELETE /api/account` cascade **in review** (this branch). Once merged, P-1/P-2 close. **Hard gate before any beta testers** (testers are real users).
- 🟡 **Reset-session revocation** (P-8) — password reset doesn't force-logout other Supabase sessions. Before beta.
- 🟡 **Mobile token refresh** (P-10) — refresh token stored but unused; expired session = silent re-login. Before beta.
- 🟠 **RevenueCat webhook** (P-3) — before any payments (Sprint 8).
- 🟡 **Branded Resend email** (P-6) + 🟢 Drizzle extra-config sweep (P-7).

**Mobile provisioning / device testing** (not needed until the first EAS/device build — I'll flag when): Supabase Google provider, `EXPO_PUBLIC_GOOGLE_*` client IDs, app.json `iosUrlScheme`, iOS Associated Domains / Android App Links, EAS dev client; real iOS + Android device testing each sprint.

**Legal / infra gates (🏢 Client + provisioning)** — see [ROADMAP](ROADMAP.md) Week-0 + critical path: ⛔ **DPA signed**, ⛔ **DPIA complete** (schema can't be finalised until then), **Privacy Policy + ToS live** (PL), and the remaining infra cutover (Upstash Redis, Cloudflare R2, Resend domain, Fly.io, Sentry — all **not yet** provisioned).

## Next decision

**Sprint 4 underway.** `feat/posts` (slice 1) implemented → Codex working-tree validation (delete-scrub / prettier / STATUS fixes applied) → full battery → commit/push → Codex final validation before PR. Backend-only, text-only this slice (R2 image upload deferred). Next Sprint-4 slices: moderation actions (ban/mute/remove + report resolve/dismiss), then mobile posts UI from `assets/*.png`, then safety features. None of the mobile-provisioning steps are needed for the backend slice.
