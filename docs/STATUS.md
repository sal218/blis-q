# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-10 — `feat/auth-screens-mobile` merged (#8); starting `feat/admin-login` (last Sprint-1 item)._

## Current phase
**Sprint 1 — auth foundation + mobile auth UI complete; building real admin sign-in (replaces the token-paste scaffold). Last Sprint-1 item.**

## Merged to `main`
| PR | What |
|---|---|
| #1 | Scaffold (12 Even Tab files adapted + fresh infra/config) |
| #2 | `docs/ROADMAP.md` (6-month plan) |
| #3 | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas |
| #4 | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test |
| #5 | `fix/env-empty-string` — empty optional env vars treated as unset |
| #6 | `feat/auth-password-reset` — atomic single-use expiring reset tokens, no enumeration, audit |
| #7 | `feat/auth-google` — Google sign-in (Supabase `signInWithIdToken`, Option A); consent on first sign-up, fail-closed cleanup; +`forceExit` CI fix |
| #8 | `feat/auth-screens-mobile` — end-to-end mobile auth UI (Polish/LTR), Google consent retry, SecureStore session, push-deregister on logout, jest-expo harness |

## In progress
- **`feat/admin-login`** — real email/password admin sign-in for the `admin/` dashboard, replacing the token-paste scaffold (`admin/src/App.tsx` `LoginScreen`). **Status: branch created + plan drafted; awaiting Codex validation of the plan before implementation.**
  - Proposed: a dedicated **`POST /api/admin/login`** that authenticates via Supabase **and gates on `isAdmin` server-side** — a non-admin (or unverified/soft-deleted) gets a generic `401` and the issued session is revoked, so no session is ever handed to a non-admin. Admin login attempts are audited (`admin.login` / `admin.login_failed`) and dual-bucket rate-limited.
  - Admin web app gets an email/password form (replacing the JWT paste); token stays in `localStorage` (**AR-1**, accepted for the owner-operated panel).
  - Open questions for Codex: dedicated `/api/admin/login` (recommended) vs reuse `/api/v1/auth/login` + `/api/admin/me`; whether to add an admin-frontend test harness or rely on backend integration tests.

## Auth endpoints live (`/api/v1/auth/*`)
`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.

## Infrastructure
| Service | Status |
|---|---|
| Supabase **prod** (`blis-q-prod`, Frankfurt) | live — 17 tables, RLS-on, Data API off |
| Supabase **test** (`blis-q-test`, Frankfurt) | live — CI integration DB; `BLISQ_TEST_*` secrets set |
| Firebase (`Blis-Q`) | live — Google provider + service account (server creds in `.env`) |
| Upstash Redis / Cloudflare R2 / Resend domain / Fly.io / Sentry / RevenueCat | **not yet** (deferred; Fly/Sentry later, rest at the provisioning cutover) |

All infra is under the `blisqadmin@gmail.com` project account (PGC-owned) — **transfer ownership to the client before real users** (see ROADMAP Week-0 + the provisioning-cutover plan).

## Known follow-ups (CLAUDE.md issue tracker)
- **P-1/P-2** (🔴 blocker, before real users): GDPR registration consent ✅ done in #4; erasure (`DELETE /api/account`) + export still pending.
- **P-3** (🟠 blocker, before payments): RevenueCat webhook.
- **P-6**: branded Resend email (currently Supabase built-in).
- **P-7**: Drizzle `pgTable` extra-config deprecation sweep.
- **P-8** (before beta): force-logout other sessions on password reset.
- **P-9**: ✅ addressed in this branch (reset deep-link token captured + scrubbed from nav/web state, never logged); re-verify when universal/App Links land.
- **P-10** (before beta): mobile token refresh not wired (refresh token stored but unused).

## Next decision
`feat/admin-login` plan — open questions for Codex: dedicated `POST /api/admin/login` (server-side `isAdmin` gate, recommended) vs reuse user login + `/api/admin/me`; admin-frontend test harness vs backend-integration coverage only. Awaiting Codex validation before implementation. Provisioning (Supabase Google provider, Google client IDs, app links, EAS dev client) still tracked for when the **live mobile device flow** is first exercised — **not needed for admin-login**.
