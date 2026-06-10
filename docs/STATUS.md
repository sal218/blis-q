# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-09 — `feat/auth-google` implemented; awaiting Codex re-review before PR._

## Current phase
**Sprint 1 — email/password auth foundation (complete) → adding Google Sign-In.**

## Merged to `main`
| PR | What |
|---|---|
| #1 | Scaffold (12 Even Tab files adapted + fresh infra/config) |
| #2 | `docs/ROADMAP.md` (6-month plan) |
| #3 | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas |
| #4 | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test |
| #5 | `fix/env-empty-string` — empty optional env vars treated as unset |
| #6 | `feat/auth-password-reset` — atomic single-use expiring reset tokens, no enumeration, audit |

## In progress
- **`feat/auth-google`** — `POST /api/v1/auth/google` (Google sign-in → Supabase session, consent enforced on first sign-up). **Status: implemented + Codex P2 fix applied; 9 new integration tests + full suite (34) green; types/lint clean. Awaiting Codex re-review before PR.**
  - Architecture: **Option A** (Codex-approved) — `supabaseClient.auth.signInWithIdToken` exchanges the Google OIDC token; Supabase verifies it and owns the session. `firebase-admin` stays FCM-only.
  - Codex-required adjustments all in: orphan auth-user deleted on `consent_required`; auth-user rollback on DB-creation failure; optional `accessToken` + `nonce` pass-through; soft-deleted block revokes the session; regression tests for each.
  - **Codex re-review P2 fix:** auth-user cleanup now **fails closed** — a `deleteAuthUser` helper reports success/failure; no-consent cleanup failure returns `500` (not `422`), DB-rollback failure is logged as a possible orphan. Two tests added for the cleanup-failure paths.
  - ⚠️ **Pending dashboard step before this works against real Supabase:** enable the **Google provider** in Supabase **prod + test** with the Google OAuth client IDs (from the Firebase project's Google Cloud). Tests mock the exchange, so CI is green without it, but the live flow needs it.
  - Also serialized Jest integration suites (`maxWorkers: 1`) — they share one real test DB and do global cleanup deletes, so parallel suites raced.

## Sprint 1 — remaining
- [ ] `feat/auth-screens-mobile` — mobile auth UI (signup → verify → login, consent, reset screen — see P-9)
- [ ] `feat/admin-login` — real Supabase admin sign-in (replace the token-paste scaffold)

## Auth endpoints live (`/api/v1/auth/*`)
`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (`google` pending Codex re-review + the Supabase Google-provider dashboard step.)

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
`feat/auth-google` architecture **resolved → Option A** (Supabase-native `signInWithIdToken`), Codex-approved. Next up after merge: `feat/auth-screens-mobile` or `feat/admin-login`.
