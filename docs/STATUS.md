# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-10 — `feat/auth-screens-mobile` implemented; awaiting Codex review before PR._

## Current phase
**Sprint 1 — backend auth foundation complete (signup/login/google/reset); mobile auth UI built (awaiting review).**

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

## In progress
- **`feat/auth-screens-mobile`** — the end-to-end mobile auth journey (Welcome → signup+consent → verify-email → login → forgot/reset → Google incl. `consent_required` retry → session persistence → polished error states). **Status: implemented; 35 client tests (logic + light component) green; types/lint clean; CI gains a `test:client` step. Awaiting Codex review before PR.**
  - **Decisions (Codex-approved):** Polish/LTR with an i18n-ready typed strings layer (no Arabic/RTL this branch); `@react-native-google-signin/google-signin` for the Google ID token; lightweight strings module (no i18next); session = AccountProfile + access + refresh tokens in **SecureStore** (profile is sensitive); logic + light component tests; Google consent retry reuses the in-memory credential (never persisted/logged), re-runs sign-in on token expiry.
  - **Structure:** `client/i18n`, `client/validation`, `client/lib/{api,session,googleAuth,googleFlow,messages}`, `client/hooks`, `client/components/{forms,…}`, `client/screens/auth`, `client/navigation`. `AuthContext` now holds the profile + drives the root navigator.
  - **P-9 handled:** reset deep-link token captured once, scrubbed from nav state + web history, never logged.
  - ⚠️ **Provisioning follow-ups before the live Google/reset flows work on a device** (CI is green via mocks): Supabase Google provider; `EXPO_PUBLIC_GOOGLE_WEB/IOS_CLIENT_ID`; app.json `iosUrlScheme` placeholder; iOS Associated Domains / Android App Links for the emailed reset link. Needs an **EAS dev client** (Google native module ≠ Expo Go).
  - **New tracker item P-10:** mobile token refresh not wired yet (refresh token is stored but unused) — before beta.

## Sprint 1 — remaining
- [~] `feat/auth-screens-mobile` — **implemented, awaiting Codex review / PR** (this branch)
- [ ] `feat/admin-login` — real Supabase admin sign-in (replace the token-paste scaffold) — *next, after the mobile flow proves the backend auth contract in practice*

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
`feat/auth-screens-mobile` implementation done → Codex review → PR. After merge: `feat/admin-login`. Provisioning (Supabase Google provider, Google client IDs, app links, EAS dev client) tracked for when the live device flow is exercised.
