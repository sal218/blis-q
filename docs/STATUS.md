# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-10 — `feat/admin-login` implemented (last Sprint-1 item); awaiting Codex review before PR._

## Current phase
**Sprint 1 — auth foundation + mobile auth UI complete; real admin sign-in built (replaces the token-paste scaffold). Last Sprint-1 item, in review.**

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
- **`feat/admin-login`** — real email/password admin sign-in for the `admin/` dashboard, replacing the token-paste scaffold. **Status: implemented (Option B, Codex-approved plan); 7 backend integration tests green; types/lint clean; admin app `tsc && vite build` clean. Awaiting Codex review before PR.**
  - **`POST /api/admin/login`** (the one unauthenticated admin route) — Supabase `signInWithPassword` then a server-side **verified/live/`isAdmin` gate**. Every failure (bad creds, unverified, missing/soft-deleted, non-admin) → the **same generic `401`**; any session issued before the gate fails is **revoked** (global sign-out). Audited `admin.login` / `admin.login_failed`; dual-bucket rate-limited (`adminLoginIp` + `adminLoginEmail`).
  - Admin web app: token-paste replaced with a Polish email/password form (`adminLogin()`); generic error copy only; token stays in `localStorage` (**AR-1**, accepted; httpOnly-cookie hardening tracked as a future AR-1 follow-up, not this branch).
  - **Codex P2 fix:** session revocation is no longer swallowed — a `revokeIssuedSession` helper logs a sanitized code on failure (reject or resolved-error) and the route still returns the generic `401` + audit. Regression test added (signOut rejects → still 401, no session, audited).
  - Tests: backend integration only (admin app has no test harness) — 8 tests: success, non-admin revoke+401, **revoke-failure still 401**, bad creds, unverified, soft-deleted revoke, 429, invalid input, audit rows.

## Auth endpoints live (`/api/v1/auth/*`)
`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Admin: **`POST /api/admin/login`** (this branch) + `GET /api/admin/me`.

## Sprint 1 — status
Backend auth (#4/#6/#7) ✅ · mobile auth UI (#8) ✅ · admin sign-in (this branch, in review). **After this merges, Sprint 1's auth scope is complete.** Sprint 2 (community/profile features) is next per [ROADMAP](ROADMAP.md).

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
`feat/admin-login` implemented (Option B) → Codex review → PR → CI → merge. That closes Sprint-1 auth. **Next: Sprint 2** (community/profile features per ROADMAP). Mobile provisioning (Supabase Google provider, Google client IDs, app links, EAS dev client) still tracked for when the **live device flow / first EAS build** is exercised — **not needed for admin-login**.
