# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-10 — `feat/auth-google` merged (#7); starting `feat/auth-screens-mobile`._

## Current phase
**Sprint 1 — backend auth foundation complete (signup/login/google/reset) → building the mobile auth UI.**

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
- **`feat/auth-screens-mobile`** — the real end-to-end mobile auth journey against the live backend contract (signup+consent → verify-email → login → forgot/reset → Google incl. `consent_required` retry → session persistence → polished error states). **Status: branch created + plan drafted; awaiting Codex validation of the plan before implementation.**
  - ⚠️ **Open question flagged to the user:** the request mentioned *Arabic/RTL*, but Blis-Q ships in **Polish (LTR)** (memory: all user-facing copy in Polish; existing screens are Polish). Plan assumes **Polish/LTR with an i18n-ready string layer**; Arabic/RTL not built unless confirmed.
  - Key decisions for Codex: navigator lib, Google-token mechanism (`@react-native-google-signin` vs `expo-auth-session`), i18n approach, session/profile persistence (no `GET /me` endpoint exists yet — P-1), and the RN test strategy.

## Sprint 1 — remaining
- [ ] `feat/auth-screens-mobile` — **in progress** (this branch)
- [ ] `feat/admin-login` — real Supabase admin sign-in (replace the token-paste scaffold) — *after the mobile flow proves the backend auth contract in practice*

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
- **P-9**: reset/verification deep-link UI must not leak the token (for `feat/auth-screens-mobile`).

## Next decision
`feat/auth-screens-mobile` plan — open questions for Codex: **Arabic/RTL vs Polish/LTR** (recommend Polish/LTR), Google-token mechanism, i18n layer, session/profile persistence without a `GET /me` endpoint, and RN test strategy. Awaiting Codex validation before implementation.
