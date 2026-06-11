# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-11 — Sprint 2 slice 2 merged (#11); starting slice 3 (`feat/account-erasure`, Art. 17 / P-2)._

## Current phase
**Sprint 2 — Auth complete → Profiles + GDPR erasure/export (ROADMAP Sprint 2). Goal: close the P-1/P-2 compliance blockers; a user can fully manage and delete their account.**

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
| #9 | `feat/admin-login` — real admin email/password sign-in (`POST /api/admin/login`, server-side `isAdmin` gate, generic 401, session revoke + sanitized logging, audit) |
| #10 | `feat/account-profile` — Sprint-2 slice 1: `GET/PATCH /api/v1/profile`, `POST /account/change-password` (verification-session revoked on every exit), `GET /account/consents`; closes the P-1 "no GET /me" gap |
| #11 | `feat/account-export` — Sprint-2 slice 2: `GET /api/v1/account/export` (GDPR Art. 20); expanded shape (notif prefs, blocks, reports, subscription), soft-deleted incl., security exclusions documented |

**🎉 Sprint-1 auth scope complete** (backend auth #4/#6/#7, mobile auth UI #8, admin sign-in #9).

## In progress
- **`feat/account-erasure`** — Sprint-2 account backend, **slice 3 of 3** (final GDPR blocker): `DELETE /api/v1/account` — transactional anonymisation cascade (GDPR Art. 17, **P-2**). **Status: branch created + plan drafted; awaiting Codex validation of the plan before implementation.**
  - Proposed: **anonymise the `users` row** (scrub PII, set `deletedAt`) consistent with the existing `deletedAt` blocking checks — not a hard row delete. One DB transaction: content (posts/messages) → `[deleted]` + author/sender severed; drop relational/consent/token rows (memberships, RSVPs, blocks, consents, push tokens, notif prefs, subscription, reset tokens); null set-null creator/reporter FKs; **anonymise `audit_log.actorId` → null** (retain rows) + write `user.deleted`. Then `invalidateProfileCache`, **revoke Supabase sessions + delete the Supabase auth user** (best-effort, DB-first ordering), generic `200`.
  - Open questions for Codex: anonymise-vs-hard-delete the `users` row; audit `actorId` null-vs-pseudonymise; cross-system rollback ordering. Tested against **every** user-referencing table.
- **Backlog (Codex):** "Deactivate account" = a **reversible pause** (hide from public/community, block/limit login, retain data, keep audit) — a safety/account-control feature, **not** GDPR erasure. Parked in [ROADMAP](ROADMAP.md) **Sprint 4** so it can't delay export/erasure.

## Auth endpoints live (`/api/v1/auth/*`)
`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Account (🔑): `GET/PATCH /api/v1/profile` · `POST /api/v1/account/change-password` · `GET /api/v1/account/consents` (merged #10). `GET /api/v1/account/export` = this branch; `DELETE /api/v1/account` = next slice.
Admin: **`POST /api/admin/login`** (#9, merged) + `GET /api/admin/me`.

## Sprint 1 — status
Backend auth (#4/#6/#7) ✅ · mobile auth UI (#8) ✅ · admin sign-in (#9) ✅. **Sprint-1 auth scope complete.** Now in Sprint 2 (account/GDPR backend → profiles) per [ROADMAP](ROADMAP.md).

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

## ⛔ Remaining blockers (must clear before beta / real users / launch)
Tracked here so they stay explicit (per Codex), not just implied by the roadmap.

**Code / engineering (PGC):**
- 🔴 **GDPR erasure + export** (P-1/P-2) — `DELETE /api/account` cascade + `GET /api/account/export`. **Hard gate before any beta testers** (testers are real users). ← Sprint 2, this work.
- 🟡 **Reset-session revocation** (P-8) — password reset doesn't force-logout other Supabase sessions. Before beta.
- 🟡 **Mobile token refresh** (P-10) — refresh token stored but unused; expired session = silent re-login. Before beta.
- 🟠 **RevenueCat webhook** (P-3) — before any payments (Sprint 8).
- 🟡 **Branded Resend email** (P-6) + 🟢 Drizzle extra-config sweep (P-7).

**Mobile provisioning / device testing** (not needed until the first EAS/device build — I'll flag when): Supabase Google provider, `EXPO_PUBLIC_GOOGLE_*` client IDs, app.json `iosUrlScheme`, iOS Associated Domains / Android App Links, EAS dev client; real iOS + Android device testing each sprint.

**Legal / infra gates (🏢 Client + provisioning)** — see [ROADMAP](ROADMAP.md) Week-0 + critical path: ⛔ **DPA signed**, ⛔ **DPIA complete** (schema can't be finalised until then), **Privacy Policy + ToS live** (PL), and the remaining infra cutover (Upstash Redis, Cloudflare R2, Resend domain, Fly.io, Sentry — all **not yet** provisioned).

## Next decision
**Slice 3 (`feat/account-erasure`) plan** awaiting Codex validation (anonymise-vs-delete, audit actorId, cross-system ordering), then implement → review → PR. This is the **last Sprint-2 GDPR blocker** — once it merges, P-1/P-2 are closed and the account can be fully managed, exported, and erased. None of the mobile-provisioning steps are needed for this work.
