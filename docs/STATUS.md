# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-13 — theme foundation merged (#15); building `feat/communities-mobile` (Sprint-3 mobile, PR 2 of 2)._

## Current phase

**Sprint 3 — Communities + block + reports (ROADMAP Sprint 3). First feature pillar. Account/GDPR scope (Sprint 2) is done. NB: only block ships — mute is deferred (DPIA-gated schema change).**

## Merged to `main`

| PR  | What                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1  | Scaffold (12 Even Tab files adapted + fresh infra/config)                                                                                                                                                      |
| #2  | `docs/ROADMAP.md` (6-month plan)                                                                                                                                                                               |
| #3  | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas                                                                                                                                                |
| #4  | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test                                                                                               |
| #5  | `fix/env-empty-string` — empty optional env vars treated as unset                                                                                                                                              |
| #6  | `feat/auth-password-reset` — atomic single-use expiring reset tokens, no enumeration, audit                                                                                                                    |
| #7  | `feat/auth-google` — Google sign-in (Supabase `signInWithIdToken`, Option A); consent on first sign-up, fail-closed cleanup; +`forceExit` CI fix                                                               |
| #8  | `feat/auth-screens-mobile` — end-to-end mobile auth UI (Polish/LTR), Google consent retry, SecureStore session, push-deregister on logout, jest-expo harness                                                   |
| #9  | `feat/admin-login` — real admin email/password sign-in (`POST /api/admin/login`, server-side `isAdmin` gate, generic 401, session revoke + sanitized logging, audit)                                           |
| #10 | `feat/account-profile` — Sprint-2 slice 1: `GET/PATCH /api/v1/profile`, `POST /account/change-password` (verification-session revoked on every exit), `GET /account/consents`; closes the P-1 "no GET /me" gap |
| #11 | `feat/account-export` — Sprint-2 slice 2: `GET /api/v1/account/export` (GDPR Art. 20); expanded shape (notif prefs, blocks, reports, subscription), soft-deleted incl., security exclusions documented         |
| #12 | `feat/account-erasure` — Sprint-2 slice 3: `DELETE /api/v1/account` (GDPR Art. 17) anonymisation cascade across every table; **closes P-1/P-2**                                                                |
| #13 | `feat/communities` — Sprint-3 slice 1: communities create/browse/get/join/leave, creator→admin, last-admin-leave guard (409), audited                                                                          |
| #14 | `feat/block-reports` — Sprint-3 slice 2: blocks (block/unblock/list, idempotent, soft-deleted unavailable) + `POST /reports`; block-only (mute deferred); audited                                              |
| #15 | `feat/theme-foundation` — Sprint-3 mobile PR 1: light/dark theme (`ThemeContext`, SecureStore-persisted, default dark) + ~20-file `useTheme()` migration + authenticated tab shell; `HomePlaceholder` removed  |

**🎉 Sprint-1 auth scope complete** (backend auth #4/#6/#7, mobile auth UI #8, admin sign-in #9). **🎉 Sprint-2 account/GDPR complete** (profile #10, export #11, erasure #12 — P-1/P-2 closed). **🎉 Sprint-3 backend complete** (communities #13, block/reports #14). **Sprint-3 mobile: theme foundation merged (#15); community screens in `feat/communities-mobile`.**

## In progress

- **`feat/communities-mobile`** — Sprint-3 mobile, **PR 2 of 2** (community screens on the #15 theme foundation). **Status: implemented; client tests 90/90 (no act warnings); types/lint/prettier/`npm test` clean. Awaiting Codex review before PR.**
  - **IA correction (Codex):** communities are **not** a top-level tab. Post-login tabs are **Home · Events · Chat · Profile**; inside **Events** a segmented control switches **Events / Safe places / Communities** (that order). Only Communities is built this slice — Home, Chat, Events, and Safe places are themed placeholders (design refs: home/chat/events/event-safeplace mockups). The old top-level Communities placeholder is removed.
  - **Shared API layer:** extracted `client/lib/api/http.ts` (request/network/retry-after/common-status mapper); `auth.ts` now builds on it (public API unchanged). New `communities.ts` + `safety.ts` clients — **screens never call `fetch`**.
  - **Communities:** browse with debounced search + offset load-more (**stale-response guard** so an old search can't overwrite a newer one); detail join/leave (sole-admin **409 → Polish copy**, disambiguated by call site not by parsing server strings); create form with **trimmed** name/description validation (mirrors server, but trims since the server schema doesn't). No image upload — `imageUrl` rendered if present, else a letter placeholder.
  - **Profile:** blocked-users list + unblock (loading/empty/error, row removed on success). `GET /blocks` consumed as a plain `PublicUser[]` (not paginated). Block _initiation_ still deferred.
  - Tests: API-client mappers (communities + safety), community validation (trim), and screen behaviour (list/search/load-more, detail join/leave incl. sole-admin conflict copy, create validation/submit/navigate, blocked-users unblock removal).
  - **Login redesign (from `assets/login-screen.png`):** login-first entry (brand, email/password, forgot, social) replaces the old 3-button Welcome; Google wired, Apple is a visual placeholder (**P-12**); sun/moon **light-dark toggle** on the screen. Quick-exit (button + neutral overlay) **removed from the UI** pending product/safety review (context/components kept on disk). Native deps aligned to SDK 54 + `@expo/vector-icons` added (fixes the Expo Go Fabric crash). Verified end-to-end on a real device (signup → email verify → login → communities).
  - **Design fidelity (decision 2026-06-14, sprint-aligned):** Home/Chat/Events/Safe-places stay bare stubs **for now**; each is rebuilt from its `assets/*.png` mockup **with its backend** in its sprint — tracked as **P-13** so it isn't forgotten. UI is always built from the mockups (light = mockup, dark = brand purple).
- **Next:** admin (communities CRUD + reports queue read), then Sprint 4.
- **Backlog (Codex):** "Deactivate account" = a **reversible pause** (not GDPR erasure) — parked in [ROADMAP](ROADMAP.md) **Sprint 4**.

## Auth endpoints live (`/api/v1/auth/*`)

`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Account (🔑): `GET/PATCH /api/v1/profile` · `POST /api/v1/account/change-password` · `GET /api/v1/account/consents` (merged #10) · `GET /api/v1/account/export` (merged #11) · `DELETE /api/v1/account` (merged #12). **Account/GDPR surface complete.**
Communities (🔑, merged #13): `POST /api/v1/communities` · `GET /api/v1/communities` · `GET /:id` · `POST /:id/join` · `DELETE /:id/leave`.
Safety (🔑, merged #14): `POST /api/v1/blocks` · `DELETE /api/v1/blocks/:userId` · `GET /api/v1/blocks` · `POST /api/v1/reports`.
Admin: **`POST /api/admin/login`** (#9, merged) + `GET /api/admin/me`.

## Sprint status

Sprint 1 (auth) ✅ · Sprint 2 (account/GDPR, P-1/P-2 closed) ✅. **Now in Sprint 3** (communities → block/reports → mobile/admin) per [ROADMAP](ROADMAP.md).

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

**Sprint 3 underway.** `feat/communities` (slice 1) implemented → Codex review → PR. Then `feat/block-reports` (**block only; mute deferred — DPIA-gated schema change**) + generic `POST /reports`. Then mobile community screens (mockups now in `assets/`) + admin communities CRUD / reports read. **Open product call settled by Codex:** communities are **user-created** (creator → admin), not admin-curated. None of the mobile-provisioning steps are needed for the backend slices.
