# Blis-Q — Build Status

> Living status board. **Update this whenever a piece of work lands** (merged PR) or a new branch starts. Pair with [docs/ROADMAP.md](ROADMAP.md) (the plan), [docs/API.md](API.md) (the contract), and `CLAUDE.md` (rules + issue tracker).

_Last updated: 2026-06-11 — Sprint 2 slice 2 merged (#11); starting slice 3 (`feat/account-erasure`, Art. 17 / P-2)._

## Current phase

**Sprint 2 — Auth complete → Profiles + GDPR erasure/export (ROADMAP Sprint 2). Goal: close the P-1/P-2 compliance blockers; a user can fully manage and delete their account.**

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

**🎉 Sprint-1 auth scope complete** (backend auth #4/#6/#7, mobile auth UI #8, admin sign-in #9).

## In progress

- **`feat/account-erasure`** — Sprint-2 account backend, **slice 3 of 3** (final GDPR blocker): `DELETE /api/v1/account` — transactional anonymisation cascade (GDPR Art. 17, **P-2**). **Status: implemented (Codex-approved plan + all required changes); 5 backend integration tests green; types/lint clean. Awaiting Codex review before PR.**
  - **Ordering (Codex, DB-first — no drift):** capture bearer token → **one DB transaction** (the anonymisation cascade) → `invalidateProfileCache(userId)` → **best-effort** Supabase global sign-out + auth-user delete → generic `200`.
  - **`users` row anonymised in place** (email `deleted-<uuid>@…`, displayName `[deleted]`, avatar/city null, isPremium/isAdmin false, `deletedAt` set) — not hard-deleted. Content → `[deleted]` + author/sender nulled; creator/reporter/reviewer FKs (communities, events, safe_places, **ad_campaigns** — Codex's catch, reports) nulled; relational/consent/token rows (memberships, RSVPs, blocks, consents, push tokens, notif prefs, **subscriptions**, reset tokens) deleted; `audit_log.actorId` → null (rows retained) + `user.deleted` with **no user identifier** anywhere.
  - Post **media** (`posts.imageUrl`) cleared and scrubbed posts/messages get `deletedAt` set (consistent with the `deleted` contract). New `eraseUser` per-user rate limiter. Tested against **every** user-referencing table incl. `ad_campaigns`, plus anonymise-in-place, media/deletedAt scrub, audit no-leak, signOut+deleteUser best-effort, storage re-runnability, 401, 429. (Endpoint-level idempotency is intentionally NOT claimed — in production `isAuthenticated` rejects the deleted user's token with `401` on a repeat call.)
  - **After merge: P-1/P-2 closed — account fully manageable, exportable, and erasable (Sprint-2 GDPR scope complete).**
- **Backlog (Codex):** "Deactivate account" = a **reversible pause** (hide from public/community, block/limit login, retain data, keep audit) — a safety/account-control feature, **not** GDPR erasure. Parked in [ROADMAP](ROADMAP.md) **Sprint 4** so it can't delay export/erasure.

## Auth endpoints live (`/api/v1/auth/*`)

`signup` · `resend-verification` · `login` · `google` · `forgot-password` · `reset-password`. (All merged. `google` live flow still needs the Supabase Google-provider dashboard step before a real device can use it.) **No regular-user `GET /me`/`/account` endpoint yet** (P-1) — the mobile app persists the profile from the auth response.
Account (🔑): `GET/PATCH /api/v1/profile` · `POST /api/v1/account/change-password` · `GET /api/v1/account/consents` (merged #10) · `GET /api/v1/account/export` (merged #11) · `DELETE /api/v1/account` (this branch, in review). **Account/GDPR surface complete.**
Admin: **`POST /api/admin/login`** (#9, merged) + `GET /api/admin/me`.

## Sprint 1 — status

Backend auth (#4/#6/#7) ✅ · mobile auth UI (#8) ✅ · admin sign-in (#9) ✅. **Sprint-1 auth scope complete.** Now in Sprint 2 (account/GDPR backend → profiles) per [ROADMAP](ROADMAP.md).

## Infrastructure

| Service                                                                      | Status                                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Supabase **prod** (`blis-q-prod`, Frankfurt)                                 | live — 17 tables, RLS-on, Data API off                                     |
| Supabase **test** (`blis-q-test`, Frankfurt)                                 | live — CI integration DB; `BLISQ_TEST_*` secrets set                       |
| Firebase (`Blis-Q`)                                                          | live — Google provider + service account (server creds in `.env`)          |
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

- 🔴 **GDPR erasure + export** (P-1/P-2) — export `GET /api/account/export` ✅ merged (#11); erasure `DELETE /api/account` cascade **in review** (this branch). Once merged, P-1/P-2 close. **Hard gate before any beta testers** (testers are real users).
- 🟡 **Reset-session revocation** (P-8) — password reset doesn't force-logout other Supabase sessions. Before beta.
- 🟡 **Mobile token refresh** (P-10) — refresh token stored but unused; expired session = silent re-login. Before beta.
- 🟠 **RevenueCat webhook** (P-3) — before any payments (Sprint 8).
- 🟡 **Branded Resend email** (P-6) + 🟢 Drizzle extra-config sweep (P-7).

**Mobile provisioning / device testing** (not needed until the first EAS/device build — I'll flag when): Supabase Google provider, `EXPO_PUBLIC_GOOGLE_*` client IDs, app.json `iosUrlScheme`, iOS Associated Domains / Android App Links, EAS dev client; real iOS + Android device testing each sprint.

**Legal / infra gates (🏢 Client + provisioning)** — see [ROADMAP](ROADMAP.md) Week-0 + critical path: ⛔ **DPA signed**, ⛔ **DPIA complete** (schema can't be finalised until then), **Privacy Policy + ToS live** (PL), and the remaining infra cutover (Upstash Redis, Cloudflare R2, Resend domain, Fly.io, Sentry — all **not yet** provisioned).

## Next decision

**Slice 3 (`feat/account-erasure`) implemented** (Codex-approved plan + required fixes: post-media scrub, deletedAt on scrubbed content, idempotency claim corrected, docs/Prettier) → Codex review → PR. This is the **last Sprint-2 GDPR blocker** — once it merges, P-1/P-2 are closed and the account can be fully managed, exported, and erased. Next: Sprint 3 (communities/membership/block-mute). None of the mobile-provisioning steps are needed for this work.
