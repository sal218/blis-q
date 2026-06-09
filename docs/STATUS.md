# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-08 — during `feat/auth-password-reset`._

## Current phase
**Sprint 1 — email/password auth foundation.**

## Merged to `main`
| PR | What |
|---|---|
| #1 | Scaffold (12 Even Tab files adapted + fresh infra/config) |
| #2 | `docs/ROADMAP.md` (6-month plan) |
| #3 | `docs/API.md` v1 API contract + `shared/types.ts` + Zod schemas |
| #4 | `feat/auth-core` — consent-backed signup + login (verification-first); validated with a real-Supabase smoke test |
| #5 | `fix/env-empty-string` — empty optional env vars treated as unset |

## In progress
- **`feat/auth-password-reset`** — `forgot-password` + `reset-password`, hashed single-use expiring tokens (`password_reset_tokens`), no enumeration, rate limits, audit, integration tests. **Status: built, awaiting Codex review (no PR opened yet).**

## Sprint 1 — remaining
- [ ] `feat/auth-google` — Google Sign-In verify (Firebase is provisioned → unblocked)
- [ ] `feat/auth-screens-mobile` — mobile auth UI (signup → verify → login, consent)
- [ ] `feat/admin-login` — real Supabase admin sign-in (replace the token-paste scaffold)

## Auth endpoints live (`/api/v1/auth/*`)
`signup` · `resend-verification` · `login` · `forgot-password` · `reset-password`. (Google pending.)

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
- **P-8**: force-logout other sessions on password reset.

## Next decision
After `feat/auth-password-reset` merges, pick the next Sprint-1 branch (Google / mobile screens / admin login).
