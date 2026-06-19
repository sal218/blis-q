# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-18 — admin-communities merged (#17); building `feat/posts` (Sprint-4 slice 1, backend-only)._

## Current phase

**Sprint 4 — Community posts + moderation actions (ROADMAP Sprint 4). Sprint 3 (communities + block + reports + mobile + admin) is done. First slice: `feat/posts` (backend-only, text-only).**

## Merged to `main`

| PR  | What                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | Scaffold (12 Even Tab files adapted + fresh infra/config)                                                                                                                                                                                       |
| #2  | `docs/ROADMAP.md` (6-month plan)                                                                                                                                                                                                                |
| #3  | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas                                                                                                                                                                                 |
| #4  | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test                                                                                                                                |
| #5  | `fix/env-empty-string` — empty optional env vars treated as unset                                                                                                                                                                               |
| #6  | `feat/auth-password-reset` — atomic single-use expiring reset tokens, no enumeration, audit                                                                                                                                                     |
| #7  | `feat/auth-google` — Google sign-in (Supabase `signInWithIdToken`, Option A); consent on first sign-up, fail-closed cleanup; +`forceExit` CI fix                                                                                                |
| #8  | `feat/auth-screens-mobile` — end-to-end mobile auth UI (Polish/LTR), Google consent retry, SecureStore session, push-deregister on logout, jest-expo harness                                                                                    |
| #9  | `feat/admin-login` — real admin email/password sign-in (`POST /api/admin/login`, server-side `isAdmin` gate, generic 401, session revoke + sanitized logging, audit)                                                                            |
| #10 | `feat/account-profile` — Sprint-2 slice 1: `GET/PATCH /api/v1/profile`, `POST /account/change-password` (verification-session revoked on every exit), `GET /account/consents`; closes the P-1 "no GET /me" gap                                  |
| #11 | `feat/account-export` — Sprint-2 slice 2: `GET /api/v1/account/export` (GDPR Art. 20); expanded shape (notif prefs, blocks, reports, subscription), soft-deleted incl., security exclusions documented                                          |
| #12 | `feat/account-erasure` — Sprint-2 slice 3: `DELETE /api/v1/account` (GDPR Art. 17) anonymisation cascade across every table; **closes P-1/P-2**                                                                                                 |
| #13 | `feat/communities` — Sprint-3 slice 1: communities create/browse/get/join/leave, creator→admin, last-admin-leave guard (409), audited                                                                                                           |
| #14 | `feat/block-reports` — Sprint-3 slice 2: blocks (block/unblock/list, idempotent, soft-deleted unavailable) + `POST /reports`; block-only (mute deferred); audited                                                                               |
| #15 | `feat/theme-foundation` — Sprint-3 mobile PR 1: light/dark theme (`ThemeContext`, SecureStore-persisted, default dark) + ~20-file `useTheme()` migration + authenticated tab shell; `HomePlaceholder` removed                                   |
| #16 | `feat/communities-mobile` — Sprint-3 mobile PR 2: communities browse/detail/create + blocked-users under Events tab; login-first redesign + sun/moon toggle; SDK-54 dep alignment + Expo entry fixes                                            |
| #17 | `feat/admin-communities` — Sprint-3 admin slice: admin communities CRUD (`GET/POST /admin/communities`, `GET/PATCH/DELETE /:id`, transactional update/soft-delete) + read-only `GET /admin/reports`; admin web Communities page + Reports queue |

**🎉 Sprint-1 auth scope complete** (backend auth #4/#6/#7, mobile auth UI #8, admin sign-in #9). **🎉 Sprint-2 account/GDPR complete** (profile #10, export #11, erasure #12 — P-1/P-2 closed). **🎉 Sprint-3 complete** (communities #13, block/reports #14, theme #15, communities/login mobile #16, admin slice #17). Now **Sprint 4** (`feat/posts`).

## In progress

- **`feat/posts`** — Sprint-4 slice 1: community posts (backend-only, **text-only** this slice; R2 image upload deferred). **Status: implemented; check:types/lint clean; posts integration suite 19/19 (real DB). Codex validated the working tree with required fixes (delete-scrub, prettier, STATUS) — applying now, then full battery → commit → push → Codex final validation before PR.**
  - **Endpoints** (all `isAuthenticated`): `GET /api/v1/communities/:id/posts` (cursor paged, newest-first), `POST /api/v1/communities/:id/posts` (**member-gated**, rate-limited), `GET /api/v1/posts/:id`, `DELETE /api/v1/posts/:id` (author **or** community mod/admin), `POST /api/v1/posts/:id/report`.
  - **Reads** are open to any authenticated user but require a **non-deleted community** and **hide posts by blocked authors** (list filters them; direct get → 404). **DELETE** soft-deletes and **scrubs stored content/media** (`content="[deleted]"`, `imageUrl=null`, `deletedAt`) — not only a DTO mask. Mutations (create / soft-delete / report) are **transactional + audited** (`post.created` / `post.deleted` / `report.submitted`). Cursor decode is **defensive** (bad cursor → 400). `new_community_post` push is **post-commit + best-effort** (failure never fails creation). Feed index `idx_posts_community` on `(communityId, createdAt, id)`.
  - **Out of scope (later Sprint 4):** moderation actions (ban/mute/remove), report resolve/dismiss (`PATCH /admin/reports/:id`), post image upload (R2), mobile posts UI.
- **Backlog (Codex):** "Deactivate account" = a **reversible pause** (not GDPR erasure) — parked in [ROADMAP](ROADMAP.md) **Sprint 4**.

## Auth endpoints live (`/api/v1/auth/*`)

`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Account (🔑): `GET/PATCH /api/v1/profile` · `POST /api/v1/account/change-password` · `GET /api/v1/account/consents` (merged #10) · `GET /api/v1/account/export` (merged #11) · `DELETE /api/v1/account` (merged #12). **Account/GDPR surface complete.**
Communities (🔑, merged #13): `POST /api/v1/communities` · `GET /api/v1/communities` · `GET /:id` · `POST /:id/join` · `DELETE /:id/leave`.
Posts (🔑, `feat/posts` in progress): `GET /api/v1/communities/:id/posts` · `POST /api/v1/communities/:id/posts` · `GET /api/v1/posts/:id` · `DELETE /api/v1/posts/:id` · `POST /api/v1/posts/:id/report`.
Safety (🔑, merged #14): `POST /api/v1/blocks` · `DELETE /api/v1/blocks/:userId` · `GET /api/v1/blocks` · `POST /api/v1/reports`.
Admin (🛡️ `isAuthenticated → requireAdmin`): **`POST /api/admin/login`** (#9, merged) + `GET /api/admin/me`. **`feat/admin-communities`:** `GET/POST /api/admin/communities` · `GET/PATCH/DELETE /api/admin/communities/:id` · `GET /api/admin/reports` (read-only). Paths stay under `/api/admin/*` (→ `/api/v1/admin/*` migration tracked).

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
