# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in the Blisko repository.

---

## Read This First

Before writing any code, read these two files in full:

- `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` — stack decisions, what was ported from Even Tab, chat architecture, infrastructure setup, file porting table, setup sequence
- `COMPLIANCE_AND_PRIVACY.md` — GDPR / Article 9 obligations, DPIA requirements, consent schema, erasure procedure, encryption decision, location data rules, pre-launch checklist

These files encode months of decisions. Do not skip them.

---

## 🚨 SECURITY-FIRST OPERATING RULES (NON-NEGOTIABLE)

These rules override convenience, speed, and shortcuts. If a change violates any rule below, it must be rejected and redesigned.

### 1. ARCHITECTURE: BACKEND-ONLY DATA ACCESS

* **NEVER** write business logic in Client Components.
* **NEVER** use database client SDKs directly in the frontend (e.g. `supabase-js` methods like `.select`, `.insert`, `.update`, `.delete`).
* **ALWAYS** access data through **Backend APIs only**:

  * Server Actions
  * API Routes
  * Edge Functions
* The **Frontend is a View Layer only**.

  * It renders UI
  * It calls APIs
  * It does **NOT** talk to the database

If the frontend needs data → create or use a backend endpoint.

---

### 2. DATABASE & RLS — THE "ZERO POLICY" RULE

* **RLS IS MANDATORY** on every table.
* **NO RLS POLICIES ARE ALLOWED**.

  * Do **NOT** create policies using `create policy ...`
* RLS enabled **without policies** acts as a **Deny-All firewall**.
* The `anon` key must have **ZERO database access**.

  * **Exception:** The anon key is used client-side to connect to Supabase Realtime Broadcast. Broadcast bypasses the database entirely (it is a pub/sub layer, not a DB operation). This is the only permitted client-side use of the anon key and does not violate this rule.
* **SERVICE ROLE ONLY**:

  * All database access must occur via `service_role`
  * Only inside Backend APIs / Server Actions / Edge Functions
  * Service role bypasses RLS by design

This guarantees:

* No accidental data exposure
* No client-side privilege escalation
* No silent auth bugs

---

### 3. STORAGE SECURITY

* **NO PUBLIC BUCKETS**

  * Never set public access on R2 buckets
* **UUID FILENAMES ONLY**

  * Rename all uploaded files to `crypto.randomUUID()`
  * Prevents file enumeration and guessing attacks
* **SIGNED URLS ONLY**

  * Always retrieve files using presigned R2 URLs
  * Never expose raw storage paths to clients
* **REDIS-BACKED UPLOAD CLAIMS**

  * Pending upload claims must be stored in Redis, not in process memory
  * In-memory claims break silently on multi-instance Fly.io deployments
  * In-memory fallback is acceptable for local dev only

---

### 4. PAYMENTS & WEBHOOKS

* **VERIFY SIGNATURES — ALWAYS**
* **NEVER** trust `req.body` directly for webhook payloads
* **ALWAYS** use `req.rawBody` for signature verification — Express re-serializes the body, changing the bytes. Signature verification requires the exact original bytes.
* Configure Express body parser to capture raw body:

  ```typescript
  app.use(express.json({
    verify: (req: any, _res, buf) => { req.rawBody = buf; }
  }));
  ```
* RevenueCat webhooks → verify using the `Authorization` header secret against `req.rawBody`
* If verification fails → **IMMEDIATELY return `400`**

No verification = invalid webhook.

---

### 5. ENVIRONMENT VARIABLES

* **STRICT SECRET HYGIENE**

  * Never hardcode secrets
  * Never log secrets
* **NO COMMITS WITH SECRETS**

  * If a secret appears in code:

    * Replace it with `process.env.VAR_NAME`
    * Warn the user
* **VALIDATION REQUIRED — CALL ORDER IS NON-NEGOTIABLE**

  * `validateEnv()` must be the **very first statement** in `server/index.ts`
  * `validateAuthConfig()` must be called immediately after, before any routes register
  * Fail fast if required variables are missing
  * In production, missing Redis credentials must crash the server — do not fail open

---

### 6. INPUT VALIDATION & RATE LIMITING

* **TRUST NO ONE**

  * Validate **ALL** inputs at the backend boundary
  * Use Zod schemas for all API routes
* **RATE LIMIT ALL MUTATIONS**

  * Auth endpoints: use **dual buckets** — both IP and email/userId buckets must pass
  * Content creation endpoints: keyed by user ID, not IP
  * Use `@upstash/ratelimit` — credentials required in production (fail fast if missing)
  * Rate limiter must **FAIL CLOSED** — Redis outage returns 429, never allow-all

No validation = rejected change.

---

### 7. RPC / POSTGRES FUNCTION LOCKDOWN

When creating a Postgres function:

```sql
REVOKE EXECUTE ON FUNCTION function_name FROM public;
REVOKE EXECUTE ON FUNCTION function_name FROM anon;
```

* Explicitly grant execution **ONLY** to `service_role`
* Never leave functions executable by default roles

---

### 8. AUTH CACHE — INVALIDATION REQUIRED

The `isAuthenticated` middleware uses a two-tier cache (Redis profile cache → DB fallback). Cache key: `profile:{userId}`, TTL: 60 seconds.

**After any mutation to the `users` table, you must call `invalidateProfileCache(userId)`.**

Failing to do this leaves a stale cached identity active for up to 60 seconds after the mutation. This includes: display name changes, email changes, `deletedAt` writes, `isPro` changes, preference changes. The account deletion endpoint must call this before returning.

---

### 9. REQUEST LOGGING — SENSITIVE FIELD REDACTION

Request logging middleware must explicitly redact sensitive fields before writing to logs.

Blocklist (minimum): `password`, `token`, `private_key`, `secret`, `authorization`, `access_key`

Never log `req.body` raw on mutation endpoints. Log endpoint, method, status code, and duration only.

---

### 10. COMPLIANCE CHECK (MANDATORY)

Before generating or accepting any code, ask:

> **"Is this code asking the Frontend to talk to the Database?"**

* If **YES** → ❌ **REJECT IT**
* Rewrite as a Backend API / Action instead

Also ask: **"Does this feature touch user data?"** If yes, consult `COMPLIANCE_AND_PRIVACY.md` before writing any schema or API code.

Also ask: **"Does this feature involve location?"** If yes, read `COMPLIANCE_AND_PRIVACY.md` Section 5.8 — location data has specific engineering constraints.

No exceptions.

---

## Testing Rules

* **Every bug fix ships with a regression test.** When fixing a bug or security issue, write an integration test (in `server/__tests__/`) on the same branch that would have caught it. This is non-negotiable.
* **Tests live next to fixes.** No separate test branches. The test and the fix are one atomic commit.
* **Integration tests use the real test DB** (Blisko test Supabase project). Credentials in `.env.test` (gitignored) and GitHub Actions secrets.
* **Run before reporting done:** Always run `npm run test:integration` before telling the user a fix is complete.
* **Test runner:** `npm test` (server unit, node:test) + `npm run test:integration` (Jest, real DB) + `npm run test:client` (Jest + `jest-expo`, React Native client logic + light component tests) + `npm run test:all` (all three).
* **Client (mobile) tests** live in `client/**/__tests__/` and run under the `jest-expo` preset (`jest.client.config.ts`). They mock the network/native boundary and cover pure logic (validation, API mapping, the Google consent/retry flow) plus light component behaviour (consent gating, error states). No real device or backend needed.

---

## Development Philosophy

**UI is built from the design mockups in `assets/*.png`.** Every screen starts from its mockup and is modified from there — do not invent layouts. **Light mode follows the mockups** (they are the light-mode reference: white surfaces, brand-purple accents); **dark mode is the brand purple** palette. Bare "coming soon" placeholders are temporary: each must be replaced with its mockup design when its feature sprint lands (tracked as **P-13**). Both modes ship for every screen.

**Target deployment: Fly.io (Warsaw, `waw` region).**

* Local dev uses ngrok tunnels for external access, Expo dev server for hot reload
* Production target is Fly.io (Express server, `fly.toml` with `primary_region = "waw"`) + Expo EAS (mobile builds)
* No Replit-specific code. No Railway-specific code. This project starts clean on Fly.io.

**Blocking dependencies before launch:**
1. **Resend verified domain** — switch sender from `onboarding@resend.dev` to a verified custom domain before any real users receive email.
2. **EAS production build** — configure `eas.json` production profile with the Fly.io API URL.
3. **DPIA completed** — schema must not be finalised until the client (Pretty Good Company) has completed their Data Protection Impact Assessment. See `COMPLIANCE_AND_PRIVACY.md` Section 4.
4. **DPA signed** — Data Processing Agreement between Pretty Good Company and the development team must be signed before any user data enters the system.

---

## Project Overview

**Blisko** is a community platform for Poland's LGBT+ community. It is built by Pretty Good Company (Sal + Adly) for the client of the same name.

**Launch target: ~December 2026** (≈6-month build from the June 2026 scaffold; ~12 two-week sprints — see [docs/ROADMAP.md](docs/ROADMAP.md)).

**Four feature pillars:**
1. **Community & Networking** — community groups, group chat, profiles
2. **Events & Safe Places** — event discovery, RSVP, curated map of LGBT-friendly locations
3. **Support & Education** — resources, news, emergency contacts
4. **Safety** — discreet icon, quick-exit button, safety-first UX design

**Revenue model:** App download fee (€1–2), premium membership (€3–5/month via RevenueCat), curated advertising.

**Target market:** Poland first, then Central & Eastern Europe, then Western Europe.

**Critical context:** Blisko's users are a vulnerable population in Poland's current political climate. The mere act of joining Blisko constitutes Article 9 special category data (sexual orientation). Every engineering decision must account for user safety and GDPR compliance from day one.

**Tech stack:** React Native + Expo (iOS, Android) + Express.js backend. Built on the same proven foundation as the Even Tab app (internal repo: `split-it`), with infrastructure hardened across two security audits. See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` for full details.

---

## Commands

### Development

```bash
npm run all:dev          # Run Expo + Express server concurrently
npm run expo:dev         # Expo development server only
npm run server:dev       # Express server only (tsx with hot reload)
```

### Database

```bash
npm run db:push          # Push Drizzle schema changes to PostgreSQL
```

### Code Quality

```bash
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run check:types      # TypeScript type check
npm run format           # Format with Prettier
```

### Production Build

```bash
npm run expo:static:build   # Build static web bundle
npm run server:build        # Build server with esbuild
npm run server:prod         # Run production server
```

---

## Architecture

### Monorepo Structure

* `client/` — React Native (Expo) frontend
* `server/` — Express.js backend
* `shared/` — Shared types and Drizzle schema

### Path Aliases

Configured in `babel.config.js` and `tsconfig.json`:

* `@/*` → `./client/*`
* `@shared/*` → `./shared/*`
* `@assets/*` → `./assets/*`

### Frontend (client/)

* **Navigation**: React Navigation with tab + stack navigators
* **State**: React Context (auth, theme) + TanStack Query (server state)
* **Entry**: `App.tsx` handles auth state routing and deep linking
* **Contexts**: `AuthContext` (user/token), `ThemeContext` (dark mode)

### Backend (server/)

* **Entry**: `index.ts` — Express setup. Startup order is non-negotiable: `validateEnv()` → `validateAuthConfig()` → CORS → Helmet → `rawBody` capture → logging → `%3F` fix → routes → error handler
* **Routes**: `routes.ts` — all API endpoints
* **Auth**: `auth.ts` — Supabase GoTrue (email/password + Google Sign-In via Supabase `signInWithIdToken`, Option A — firebase-admin is FCM-only). Two-tier cache: JWKS local JWT verification + Redis profile cache (60s TTL, key: `profile:{userId}`)
* **Database**: `storage.ts` — repository pattern via `DatabaseStorage` class
* **Object storage**: `objectStorage.ts` — Cloudflare R2 (private, presigned URLs only, Redis-backed upload claims)
* **Notifications**: `notifications.ts` — Firebase Cloud Messaging via firebase-admin
* **Rate limiting**: `rateLimit.ts` — Upstash Redis, fail-closed on error, dual buckets on auth flows
* **Real-time**: handled client-side via Supabase Realtime Broadcast — no server-side socket code

### Database (shared/schema.ts)

PostgreSQL with Drizzle ORM. Key tables:

* `users` — accounts, preferences, `displayName` (public alias)
* `communities` — community groups
* `community_memberships` — user-community many-to-many (role: member / moderator / admin)
* `messages` — community chat (plaintext, moderation-accessible — see COMPLIANCE_AND_PRIVACY.md Section 5.6)
* `events` — community events
* `event_rsvps` — event attendance
* `safe_places` — map locations (LGBT-friendly venues, services, resources)
* `reports` — content moderation queue
* `consent_records` — GDPR explicit consent per user per purpose (**mandatory — see COMPLIANCE_AND_PRIVACY.md**)
* `audit_log` — security and compliance log (**mandatory — see COMPLIANCE_AND_PRIVACY.md**)
* `device_push_tokens` — FCM tokens per device
* `notification_preferences` — per-user notification settings
* `subscriptions` — premium membership state (synced from RevenueCat webhooks)
* `password_reset_tokens` — custom password-reset flow: SHA-256 token hash, expiry, single-use marker (never the raw token)

**Every table must have explicit `ON DELETE` behaviour defined in its migration. No implicit defaults. See COMPLIANCE_AND_PRIVACY.md Section 5.2.**

**Schema must not be finalised until the DPIA is complete. See COMPLIANCE_AND_PRIVACY.md Section 4.**

### Authentication

* **Email/Password**: Supabase GoTrue
* **Google Sign-In** (Option A): native Google SDK (`@react-native-google-signin/google-signin`) → Google OIDC ID token → backend `supabaseClient.auth.signInWithIdToken` (Supabase verifies the token) → session. firebase-admin is **not** used for auth (FCM only). Consent is enforced on first sign-up (422 `consent_required` → retry with consent).
* **Token storage**: SecureStore (native) — Supabase session tokens **and** the profile (sensitive in this app). See `client/lib/session.ts`. Token refresh is not yet wired (tracker **P-10**).
* **Middleware**: `isAuthenticated` in `auth.ts` — local JWKS JWT verification + Redis profile cache + `deletedAt` check

### Real-Time Chat

Supabase Realtime **Broadcast mode** (not Postgres Changes). See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 3.9 for the full architecture, connection lifecycle pattern, and cost management guidance. Connection lifecycle rules are **mandatory** — idle subscriptions left open will exhaust Supabase Realtime connection limits.

The client connects to Realtime using `EXPO_PUBLIC_SUPABASE_ANON_KEY`. This does not violate the zero-DB-access rule — Broadcast bypasses the database entirely.

### File Storage

Cloudflare R2 — EU jurisdiction bucket. No public access. All files retrieved via presigned URLs. All uploads renamed to `crypto.randomUUID()` before storage. Upload pending claims stored in Redis (not in-memory). See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 3.1 for provisioning notes.

---

## Environment Variables

Required for all environments:

```
DATABASE_URL                    # PostgreSQL connection string (Supabase pooler, port 6543)
SUPABASE_URL                    # Supabase project URL
SUPABASE_ANON_KEY               # Supabase anon key (used client-side for Realtime only — zero DB access due to RLS)
SUPABASE_SERVICE_ROLE_KEY       # Supabase service role key (server only — never expose to client)
SESSION_SECRET                  # Token signing secret (min 32 chars)
EXPO_PUBLIC_API_URL             # API base URL for the client (Fly.io domain in production)
EXPO_PUBLIC_SUPABASE_URL        # Supabase URL for client-side Realtime connection
EXPO_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key for client-side Realtime connection
```

Firebase (Google Sign-In + Push Notifications):

```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
FIREBASE_PROJECT_ID             # Server-side admin
FIREBASE_CLIENT_EMAIL           # Server-side admin
FIREBASE_PRIVATE_KEY            # Server-side admin (include escaped newlines — \n)
```

Google Sign-In (native, mobile client — Option A `signInWithIdToken`):

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID   # OAuth Web client ID — its audience must match the Supabase Google provider
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID   # OAuth iOS client ID (also the basis for the app.json iosUrlScheme)
```

Cloudflare R2:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_AVATARS
R2_BUCKET_COMMUNITY_IMAGES
R2_BUCKET_EVENT_IMAGES
R2_BUCKET_POST_IMAGES
R2_ENDPOINT                     # https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Upstash Redis (required in production — server will refuse to start without these):

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Email:

```
RESEND_API_KEY
```

RevenueCat (webhooks):

```
REVENUECAT_WEBHOOK_SECRET       # Used to verify incoming webhook signatures against req.rawBody
```

Sentry:

```
SENTRY_DSN
```

App URLs:

```
INVITE_LINK_BASE                # Base URL for invite/deep links (Fly.io server URL)
WEB_APP_URL                     # Expo web URL (server-side)
EXPO_PUBLIC_WEB_APP_URL         # Web app base URL exposed to the client (deep-link prefix + legal doc links)
```

---

## Known Gotchas

### `drizzle-kit push --force` Disables RLS — Never Run It

Drizzle does not manage RLS (it lives in `supabase/rls.sql`), so `drizzle-kit push` reads RLS as schema drift and proposes `DISABLE ROW LEVEL SECURITY` on **every** table. With `--force` that applies with no prompt — silently tearing down the zero-policy deny-all firewall (§2) on whatever DB `DATABASE_URL` points at (`.env` = **prod**). This actually happened once (see `docs/DEPLOY.md` incident log). The `db:push` script no longer uses `--force`. Deploy schema changes with the safe sequence: `npm run db:push` (interactive — apply additive DDL only, decline RLS-disable lines) → it re-applies `supabase/rls.sql` → `npm run check:rls` verifies every expected table is RLS-enabled with zero policies. New tables are created RLS-**disabled** by default, so `rls.sql` must always be re-run after DDL. Full procedure in `docs/DEPLOY.md`.

### Trust Proxy — Required for Fly.io

Fly.io sits behind a proxy. Without `app.set('trust proxy', 1)` in `server/index.ts`, `req.ip` returns the proxy IP instead of the real client IP. This breaks rate limiting (all requests appear to come from one IP) and audit logging. This must be set and must not be removed.

### Supabase Realtime — Connection Lifecycle is Mandatory

The Realtime channel for community chat must be subscribed **only** when the chat screen is active and the app is in the foreground. Unsubscribe on navigate-away and on `AppState` change to `background`. This is not a performance optimisation — it is required to stay within Supabase Realtime connection limits. Failing to do this will cause silent connection exhaustion at scale. See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 3.9 for the exact pattern.

### Supabase Realtime Pricing

Specific concurrent connection limits and overage billing model should be verified at supabase.com/pricing before making capacity assumptions. Verify the exact numbers before planning for scale.

### Resend Click-Tracking `%3F` Encoding

Resend's click-tracking encodes `?` as `%3F` in redirect URLs. This causes `/reset-password?token=...` to arrive as `/reset-password%3Ftoken=...`, breaking Express route matching. Fix: register a middleware before all routes in `server/index.ts` that detects `%3F` in the raw URL and issues a 302 redirect with a real `?`.

### consent_records and audit_log Are Non-Optional

These two tables are legal requirements, not product features. They must exist from the first migration. Do not defer them. See `COMPLIANCE_AND_PRIVACY.md` Sections 5.1 and 5.3 for the exact schemas.

### Schema Must Not Be Finalised Before DPIA

The client (Pretty Good Company) must complete a Data Protection Impact Assessment before the schema is locked. If the DPIA determines certain data should not be collected, retrofitting schema changes is expensive. See `COMPLIANCE_AND_PRIVACY.md` Section 4.

### R2 — EU Jurisdiction Bucket

The R2 bucket must be created with EU jurisdiction selected at creation time. This cannot be changed after the fact. See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 3.1.

### Profile Cache Must Be Invalidated After User Mutations

The two-tier auth cache (Redis profile cache, 60s TTL) means stale identity data persists for up to 60 seconds if not explicitly invalidated. Call `invalidateProfileCache(userId)` in every storage method that writes to the `users` table. The account deletion endpoint must also call this before returning — a deleted account that stays cached for 60 seconds is a security issue.

### Upload Pending Claims Must Be Redis-Backed

If upload pending claims are stored in process memory (a `Map`), they fail silently when Fly.io runs multiple instances — a claim written on instance A is invisible to instance B. Use Redis for pending claims with an in-memory fallback only for local dev.

### Quick-Exit Feature — No Animation, No navigation.navigate

The quick-exit overlay must switch to the neutral screen with zero animation. Any entrance animation is visible to an observer and defeats the safety purpose. Use `display: 'none'` → `display: 'flex'` synchronously. Never use `navigation.navigate()` (async) or a `Modal` (has entrance animation) for this feature.

### rawBody Required for Webhook Signature Verification

RevenueCat (and any future payment provider) webhook signature verification requires the raw request bytes. Express's `json()` body parser re-serializes the body by default. Ensure the body parser is configured with a `verify` callback that captures `req.rawBody = buf`. Without this, signature verification will always fail.

### Google Sign-In — Dev Client Required (not Expo Go) + Provisioning

`@react-native-google-signin/google-signin` is a native module: it does **not** run in Expo Go — use a custom **EAS dev client** / build. Three provisioning steps must be done before the live Google flow works (mocks keep CI green without them):
1. **Supabase**: enable the Google provider (prod + test) with the Google OAuth client IDs (audience must match `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`).
2. **Client env**: set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` + `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
3. **app.json**: replace the `iosUrlScheme` placeholder (`com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID`) in the google-signin plugin with the real reversed iOS client ID.

### Push Token Must Be Deregistered on Logout (before clearing the session)

Logout must call `deregisterPushToken()` **before** clearing the auth session, while `fetchWithAuth` can still attach the access token. Otherwise a signed-out (possibly shared) device stays attached to the old account on the backend and keeps receiving its notifications — in Blis-Q those can reveal sensitive membership/activity. Registration and deregistration must use the **same** token: the **Expo push token** (`getExpoPushTokenAsync`), not the native device token (`getDevicePushTokenAsync`). The registered token is persisted in SecureStore (`client/notifications/usePushNotifications.ts`) so logout deactivates exactly that token.

### Expired Session Is Signed Out (until refresh exists)

`client/lib/session.ts` `loadSession()` treats a missing/invalid/**past** `expiresAt` as signed out (clears the store, returns null). Until token refresh is wired (tracker **P-10**), a cached profile must NOT route the user into the authenticated tree with an access token the backend will reject.

### Reset Deep-Link Token Must Not Leak (P-9)

The reset-password deep link carries the raw token. `client/screens/auth/ResetPasswordScreen.tsx` captures it once into a ref, then scrubs it from navigation state (`setParams({ token: undefined })`) and the web URL (`history.replaceState`). Never put the token in logs, analytics, or persisted navigation state. The emailed `https://<web>/reset-password` link needs iOS Associated Domains / Android App Links configured at provisioning to open the app directly.

---

## 📋 Issue Tracker

Single source of truth for all bugs, security findings, and pre-release checklist items.

Categories: 🐛 Bug · 🔒 Security · ⚡ Perf · 🔧 Stability · 🏗️ Infra · 📬 Ops
Severity:   🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

### Completed

| # | Item | Cat | Sev | Branch |
|---|---|---|---|---|
| — | — | — | — | — |

### Pending

Surfaced in the 2026-06-02 scaffold review. **P-1 and P-2 are hard blockers before this branch onboards any real user; P-3 is a hard blocker before it processes any payment.** Deferral is valid only because the scaffold currently has no registration route and no webhook route — it physically cannot onboard users or take payments yet. P-4/P-5 are genuine low-priority cleanups.

| # | Item | Cat | Pri | Notes |
|---|---|---|---|---|
| P-1 | GDPR routes not implemented: consent-backed registration, `DELETE /api/account` (erasure), `GET /api/account/export` | 🔒 | 🔴 | **BLOCKER — no real users until done.** Scaffold mounts `/api/health` + admin only. COMPLIANCE §5.1 / §5.2 / §5.5 |
| P-2 | Erasure/anonymisation cascade not implemented (no generic soft-delete method is exposed; see `storage.ts` note) | 🔒 | 🔴 | **BLOCKER — no real users until done.** Transactional: clear PII, content→`[deleted]`, drop memberships/RSVPs/tokens/consents, audit entry, call `invalidateProfileCache`. Lives in the `DELETE /api/account` handler. COMPLIANCE §5.2 |
| P-3 | RevenueCat webhook route not implemented (env var + `revenuecatWebhookIp` limiter already scaffolded) | 🔒 | 🟠 | **BLOCKER — no payments until done.** Verify `Authorization` against `req.rawBody`, 400 on failure, then process. CLAUDE.md §4 |
| P-4 | Functions exceeding ~40 lines: `setupCors`, `setupHelmet` (index.ts), `buildMessage` (notifications.ts) | 🔧 | 🟢 | Extract helpers/constants. ENGINEERING_STANDARDS §2 |
| P-5 | `routes.ts` doc comment lists domain route modules not yet mounted | 📬 | 🟢 | Keep accurate as modules land |
| P-6 | Auth/verification emails use Supabase's built-in sender; switch to branded Resend on the verified domain before launch | 📬 | 🟡 | Sprint-1 stand-in (does not change the verification-first auth model). `POST /api/v1/auth/resend-verification` already exists. |
| P-7 | Migrate `shared/schema.ts` `pgTable` extra-config callbacks from the deprecated object-return form to the array-return form | 🔧 | 🟢 | Drizzle deprecation hints (not errors); whole-schema sweep, do in one pass. |
| P-8 | Password reset does not force-logout the user's other Supabase sessions; **ban cannot instantly kill a target's open sessions** | 🔒 | 🟡 | **Before beta.** Supabase admin lacks a clean bulk "revoke all sessions by userId" (needs a JWT). Revisit when sessions/refresh-token revocation is wired. After reset, old refresh tokens may remain valid. **AUTH-1 tie-in:** the same limitation means banning a user can't immediately revoke their Supabase session, so a pre-ban Realtime chat socket keeps flowing until the next auth check / access-token expiry. Mitigated at the authorization layer by the `banned_at/deleted_at` guard in `supabase/realtime-auth.sql` (`fix/ban-realtime-revoke`, P-24); an instant server-initiated kill still needs revoke-by-userId here. |
| P-9 | Reset/verification deep-link UI must not leak the token | 🔒 | 🟡 | **Addressed in `feat/auth-screens-mobile`:** `ResetPasswordScreen` captures the token once, scrubs it from navigation state via `setParams({ token: undefined })` and from the web URL via `history.replaceState`, and never logs it. **Re-verify** when universal/App Links replace the `blisq://` scheme at provisioning. |
| P-10 | Mobile session-token refresh | 🔒 | 🟡 | **Implemented in `feat/mobile-token-refresh`** (mid-session path). New `POST /api/v1/auth/refresh` exchanges the stored Supabase refresh token for a rotated session, reusing login's deleted/banned gates (deleted→401+revoke; banned→403 `account_suspended`+revoke; `bannedAt` off the DTO). Client: the shared `request()` chokepoint auto-refreshes on a 401 from an authenticated endpoint (single-flight, one retry; auth paths excluded so a bad-login 401 is untouched); on refresh failure the user is signed out to login with a "session expired" notice (`AuthContext.sessionExpired` → `LoginScreen`); banned-on-refresh → suspension screen. **Cold-start refresh added in `feat/cold-start-refresh`:** `loadSession()` now refreshes a genuinely-expired access token (valid past expiry + refresh token present) on app launch instead of signing out, so a returning user stays logged in across restarts (suspended-on-cold-start → login → re-gated by P-20). **Remaining follow-ups:** (a) don't sign out on a *transient network failure* at cold-start (today `refreshSession` collapses network/revoked/other into "failed" → cold-start clears; a launch-time offline blip forces re-login) — would need a distinct "offline" outcome; (b) surface the suspension screen directly on cold-start (vs via re-login); (c) pair with P-8 session revocation. |
| P-11 | Bottom-tab icons were emoji `Text` placeholders (`client/navigation/AppTabs.tsx`) | 🔧 | 🟢 | **Addressed in `feat/home-screen-shell`:** replaced with Phosphor v2 (regular) icons inlined as `react-native-svg` paths (`client/components/icons/PhosphorIcons.tsx`) — house · calendar-minus · chats-teardrop · user; active tab = brand-purple tint, taller bar with vertically-centered icon+label. Added `react-native-svg@15.12.1` (native module → **dev-client rebuild required**). |
| P-12 | "Continue with Apple" on the login screen is a visual placeholder (no handler) | 🔒 | 🟡 | **Before launch.** `LoginScreen` renders the Apple button per the design, but Sign in with Apple isn't implemented (needs `expo-apple-authentication` + the backend exchange). App Store Guideline 4.8 **requires** Apple sign-in once Google is offered, so this must ship before iOS release. |
| P-13 | Placeholder tab screens must be rebuilt from their mockups when their sprint lands | 🎨 | 🟡 | **Do not forget — sprint-aligned by decision (2026-06-14).** `ChatScreen` + the Events-tab Events/Safe-places segments are bare `ComingSoon` stubs. Build each from its `assets/*.png` mockup **with its backend**, replacing the stub: **Chat** (`chat-screen.png`, Sprint 5), **Events** (`events-screen.png`, Sprint 6), **Safe places** (`event-safeplace-screen.png`, Sprint 7). **Home shell built** in `feat/home-screen-shell` (greeting + live communities rail + placeholder sections) — the events/safe-places/activity rails fill in as those backends land; a reusable `SectionHeader`/`CommunityRailCard` kit was introduced for them to reuse. **Home "Upcoming events" rail wired** in `feat/home-upcoming-events` (`GET /api/v1/events/mine` = the caller's own upcoming "going" events → reused `EventCard`s); safe-places (Sprint 7) + activity (P-13) rails still placeholders. Light mode must match the mockups (mockups are light; dark = brand purple). **Progress:** **Chat** built (Sprint 5, #38–#41). **Events** — backend #44 + the **Events feed/detail/RSVP UI** (#45, going count aggregate-only, **no attendee avatars** — privacy) + the **create-event form** (#46, member-only "+ Utwórz wydarzenie" on Community detail → `CreateEventScreen`; native `@react-native-community/datetimepicker`). Now the **events-detail epic** (per `assets/Event-Details*.png`): **A — Event Detail visual redesign** in `feat/event-detail-redesign` (banner from `imageUrl` + gradient placeholder, stacked date badge, icon rows, pinned RSVP bar, light+dark; pure UI). **Epic deferrals (tracked):** **A-followups** — banner **upload** needs the R2 pipeline; **share + ⋯ menu**; immersive transparent-header banner. **B** — event **cancel + past/expired** grayed states. **B1 (backend) shipped** (#51): additive `events.status`/`cancelledAt` (on TEST+PROD), creator-only `POST /events/:id/cancel` (guarded + audited, content kept), `EventDTO` gains `status`/`cancelledAt`/`past`/`canCancel`, cancelled excluded from `/events` + `/events/mine`, race-safe `setRsvp` 409s on cancelled/past. **B2 (mobile UI) built** in `feat/event-cancel-mobile-ui`: Event Detail cancelled/past notice + disabled RSVP bar + the creator "Anuluj wydarzenie" ⋯ action (gated by `canCancel`, `Alert.alert` confirm), `useEvent.cancel()` + a cancel-specific error mapper; plus a small backend coherence fix (`cancelEvent` rejects a past event → 409). **Epic slice B complete.** **C** — **Save** events + saved-events list. **C1 (backend) built** in `feat/event-save`: additive `event_saves` table (private per-user bookmark; both FKs cascade; applied TEST+PROD, in `supabase/rls.sql`, check:rls 18/18), `POST`/`DELETE /events/:id/save` (idempotent, visible-gated, `rsvpUser`-limited, not audited) + `GET /events/saved` (caller-scoped upcoming), `EventDTO.saved` (private boolean — no count/who-saved surface). **C2 (mobile) built** in `feat/event-save-ui`: the "Pójdę + Zapisz" two-button bottom bar (Save = a `Bookmark` icon, filled when `event.saved`), `useEvent.toggleSave()` (optimistic + revert-on-failure + stale-guard), a `SavedEventsScreen` (+ `useSavedEvents` refetch-on-focus) reached via a Bookmark header button on the Events tab. **Epic slice C complete.** **D** — **tags**. **D1 (backend) built** in `feat/event-categories`: additive nullable `events.category` (text) + composite index `idx_events_category_start` on `(category, starts_at, id)` (applied TEST+PROD, in Drizzle schema); a frozen predefined `EVENT_CATEGORIES` tuple in `shared/types.ts` (`social/support/activism/education/culture/sports/health/other`) enforced by `z.enum` (`eventCategorySchema`) — 🔒 deliberately event-TYPE, **never** identity/orientation (a category must not infer Article 9 data; custom/free-text rejected); `EventDTO.category` (nullable, stripped on a deleted tombstone); optional on create/update (out-of-set→400); `GET /events?category=` filter via a dedicated `eventsListQuerySchema` (kept off the shared `cursorPageQuerySchema` used by posts/chat), null-category excluded, keyset intact. **D2 (mobile) built** in `feat/event-categories-mobile` (closes epic D): a reusable `CategoryChip` used as **feed filter chips** ("Wszystkie" + 8 categories → `useEvents` hook-owned `category`/`setCategory` refetching via `?category=`), a **create-form picker** (optional toggle chips → `createEvent({ category? })`), and a **read-only chip** on `EventCard` + Event Detail; `listEvents(cursor?, category?)`; Polish labels (`strings.events.categories` + `filterAll`/`categoryLabel`/`emptyCategory`). Search stays client-side (P-28); edit-category UI deferred with edit/delete-event UI. **Report-event UI** (⋯ overflow → "Zgłoś wydarzenie" → reused `ReportPostModal`) built in `feat/event-report-action`. **Event SHARE deferred to its own slice** — a share that opens the event needs **universal/App-Links provisioning** (Apple Associated Domains + Android App Links + a domain) + a **neutral, Article-9-safe web landing** (no public event page / OG-preview leak); the in-app native share sheet is trivial once that link exists. Also deferred: **edit/delete event UI** (backend PATCH/DELETE exist) · directions (no GPS coords) · online-Zoom / hosted-by / open-to-all fields (DPIA) · recurring · explicit timezone. **Safe places** — **backend built** in `feat/safe-places-backend` (Sprint 7): frozen `SAFE_PLACE_CATEGORIES` (coarse venue-type, Article-9-safe), user read API `GET /api/v1/safe-places` (offset + `?category=&city=&near=lat,lng`; `near` ephemeral order-by only; null-coords-last then nearest-first; deterministic `city,name,id`) + `GET /:id`, admin CRUD (`requireAdmin`, rate-limited, transactional + audited IDs-only, soft-delete), lat/lng both-or-neither; + a `%3F`-logger coord-leak fix (`server/resendUrlFix.ts`, path-only). **Mobile map/list UI** (needs R2/PMTiles basemap + MapLibre dev-client) + **admin-web CRUD page** deferred. Mobile screen still a `ComingSoon` stub. **Related UI follow-ups:** tab-bar real icons (P-11, **done**); the segment-aware "See all" nav from Home; **bookmark/save events** (mockup shows a bookmark — no backend yet, omitted) and **server-side event search + category filter chips** (P-28; the feed search is client-side over loaded events only). |
| P-14 | Full prod↔schema parity pass + `check:rls` on prod before launch | 🏗️ | 🟡 | **Before launch.** The 2026-06-18 RLS/schema incident (`docs/DEPLOY.md`) showed prod schema sync had been ad hoc: prod was missing `password_reset_tokens`, and the test DB had RLS disabled on all tables — both now repaired. `db:push --force` is neutralized + `db:rls`/`check:rls` added (`fix/db-push-rls-safety`). Do a full parity sweep between the committed Drizzle schema and prod, and add `npm run check:rls` against prod to the launch checklist. |
| P-15 | Admin ban/unban user + `GET /admin/users` | 🔒 | 🟡 | **Implemented in `feat/user-ban`** (backend-only). `users.bannedAt` (additive) + gate integration: banned users are resolved but `isAuthenticated` → 403; GDPR export/erasure stay reachable via `isAuthenticatedAllowBanned`; erasure clears `bannedAt` + anonymises user-targeted audit `resourceId`. `GET /admin/users` + `/:id`, `POST /admin/moderation/ban`/`unban` (guarded atomic + audited + cache-invalidated). **Deploy:** apply `users.bannedAt` to prod via `docs/DEPLOY.md` after merge. `/mute` deferred (DPIA — API §12). |
| P-16 | Admin set-`isAdmin` (`PATCH /admin/users/:id`) | 🔒 | 🟢 | Admin **reports-queue** UI shipped (#27); admin-web **users/ban-unban UI** shipped (`feat/admin-users-web`, #29). Still pending: admin **set-`isAdmin`** (privilege escalation — own audit + guardrails). Ban `reason` storage is now scoped under **P-21** (`moderation_actions` table). |
| P-17 | Quick-exit + discreet-mode safety UI — **PAUSED** | 🔒 | 🟡 | Intentionally kept un-wired (`client/App.tsx` note — "do not re-add without sign-off"). `QuickExitProvider`/`QuickExitOverlay`/`QuickExitContext` exist but aren't mounted; no visible trigger. **Pending a client/product safety decision** — concern: a visible quick-exit/discreet trigger may create shame or become a "tell". Do not re-enable without explicit sign-off. **⚠️ Pitch-deck deviation:** the deck **explicitly requires** quick-exit ("Optional quick-exit button instantly switches to a neutral screen") and `docs/ROADMAP.md` lists it as a **"never cut" safety gate** — so this pause is a deviation from the brief. **Reconcile with the client** (keep / redesign / drop) before launch. |
| P-18 | Dedicated dev/staging DB for manual testing | 🏗️ | 🟢 | Manual device/dashboard testing currently hits the **prod** Supabase DB (the dev stack's `.env` points there); the CI test DB isn't safe to share (CI does broad cleanups). Stand up a third dev/staging Supabase project so manual testing never touches prod. Pre-launch nicety, not a blocker. |
| P-19 | Admin reports queue: hide "Usuń treść" when the post is already deleted | 🔧 | 🟢 | Deferred from `feat/admin-moderation-web` (#27). The reports list doesn't know a reported post's deleted state, so "Usuń treść" shows even when already removed → graceful 404 + reload. Clean fix: add a `resourceDeleted` flag to the admin reports list (small backend change) and hide the button. Low priority — current behavior is graceful. |
| P-20 | Mobile suspension UX (banned-user experience) | 🔒 | 🟡 | **Slice 1 of the Suspension & Appeals feature** (`docs/MODERATION_APPEALS.md`) — **implemented in `feat/mobile-suspension-ux`.** Additive `code: "account_suspended"` on the banned 403 (`server/auth.ts`) + **login gating** (email + Google handlers revoke session + audit `user.login_blocked_suspended` + 403 `code`; `getAccountProfile` gains `bannedAt`, off the DTO) → deterministic trigger. Client: `request()` chokepoint detects the code (monotonic suspension-generation guard) → `AuthContext` force-logout → top-level `AccountSuspendedScreen` (Polish, calm; env-gated `SUPPORT_EMAIL` appeal link + back-to-login). **Deferred (follow-ups):** export/delete CTAs (no mobile account-mgmt UI exists yet); deterministic cold-start/reopen probe (reopen is reactive on first gated call); push-token deregister backend (`/api/push-tokens` route absent). UI → device test before PR. |
| P-21 | Ban reason + suspension/reinstatement emails | 🔒 | 🟡 | **Slice 2** (`docs/MODERATION_APPEALS.md`). New **`moderation_actions`** table (DPIA-gated; add to `supabase/rls.sql`) storing a coarse, behaviour-based `reasonCategory` (**never** protected-class; never in `audit_log`). Ban/unban write it transactionally; post-commit **best-effort** discreet email (neutral subject — Article 9 shared-inbox safety). Real delivery gated on the **Resend verified domain (P-6)**. Erasure deletes target rows + nulls actor; export includes them sans `actorId`. |
| P-22 | Full in-app appeals (Instagram/Facebook-style) | 🔒 | 🟡 | **Slice 3** (`docs/MODERATION_APPEALS.md`; depends on P-20 + P-21). New **`appeals`** table (DPIA-gated). `POST/GET /api/v1/account/appeal` (banned-allowed, rate-limited) + admin `GET /admin/appeals` + `POST /admin/appeals/:id/decision` (guarded transition; grant → unban + email). Mobile appeal form on the suspension screen; admin Appeals queue page. Erasure deletes the user's appeals (free-text PII) + nulls reviewer. **Client owns** the appeal window/SLA + the `reasonCategory` policy. |
| P-23 | Moderation-specific delete copy in the feed | 🔧 | 🟢 | Deferred from `feat/mobile-mod-delete-posts`. A moderator deleting **another** member's post reuses the own-post confirm copy (`strings.posts.deleteConfirmTitle/Body`) and the generic "Usuń" label. If product wants moderation-specific wording (e.g. a distinct confirm or a "removed by moderator" tombstone), add it then. Cosmetic — the action + server authorization are unchanged. |
| P-24 | Community chat mobile — **P-24a thread + P-24b inbox done**; P-24c rich features pending | 🔒 | 🟡 | **P-24a thread + Realtime auth — MERGED (#39):** `useCommunityChat` (HTTP history + private-channel subscribe, mandatory lifecycle, dedup, client-side live block-filter, gap-fill, optimistic send) + `ChatThreadScreen`; `supabase/realtime-auth.sql` (RLS on `realtime.messages` + `SECURITY DEFINER` member fn; app-table zero-policy unchanged) **applied to the live project**; live auth spike + on-device test passed. **P-24b Messages inbox — implemented in `feat/chat-inbox`:** `GET /api/v1/chats` → `listUserChats` (joined communities + role + last-message preview via a `row_number()` window, block-filtered, deleted masked; direct membership join — ALL joined chats; unpaginated v1) + `ChatSummaryDTO`; the Chat tab becomes a **ChatStack** (`ChatInboxScreen` → reused `ChatThread` via a shared param type); `useChats` (HTTP, refetch-on-focus, **no Realtime** — never subscribe to all communities, §3.9). Community-chats-only (no DMs/Requests/search/unread). **AUTH-1 (banned/erased user kept live chat) FIXED in `fix/ban-realtime-revoke`:** `chat_topic_is_member` now joins `public.users` and requires `banned_at IS NULL AND deleted_at IS NULL`, so a banned/erased identity is denied at the next Realtime subscribe/setAuth (applied to TEST+PROD; predicate regression-tested in `server/__tests__/realtime-auth.integration.test.ts`). **Residual (P-8):** an already-open pre-ban socket keeps flowing until the next auth check / access-token expiry — instant server-initiated kill needs revoke-by-userId (P-8). **Still pending: P-24c** unread/read-state + rich features (reactions, images, pins, presence, search). |
| P-25 | Admin message removal (chat) | 🔒 | 🟢 | Admin-web "remove reported message" action. Reported messages already flow into the existing moderation queue; the queue's content-removal now covers **posts + events** (`adminRemovePost`/`adminRemoveEvent`; admin-web event button in `feat/admin-event-removal`) — **messages are the remaining gap**. Add an admin message-removal path (own audit, guarded atomic, like `adminRemovePost`) + admin-web wiring when the chat moderation UI lands. |
| P-26 | Direct messages (1:1) — **PAUSED: confirm with client (not in the pitch deck)** | 🔒 | 🟡 | **⚠️ NOT in the pitch deck** (2026-06-27 review): the deck's only chat feature is **"group chats"** (built as community chat) — **no 1-1/private DMs anywhere**. The cofounder believed the client wanted DMs, but it's not in the written brief, and DMs are the **heaviest safety/DPIA feature** in the app. **PAUSED — confirm with the client before building any DM schema/code.** If confirmed, the plan below stands. **In v1 (if confirmed), after community chat.** Community-gated message-requests (no friend graph), block both directions, report DM message → moderation queue (report-gated + audited + DPIA-disclosed moderator access), admin remove/ban, rate limits, erasure/export, **no E2EE**, **no screenshots** in v1. New `conversations` + `direct_messages` tables + `new_direct_message` push (sender alias only). Reuses the Broadcast+Postgres foundation on `dm:{conversationId}`. **Schema not locked before the DPIA covers DMs.** Full scope: `docs/ROADMAP.md` + [[direct-messages-v1-scope]] memory. Ad-hoc group chats deferred post-v1. |
| P-27 | Admin moderator-actions view (surface `audit_log`) | 📬 | 🟢 | The `audit_log` already records every moderation action (post/message deletes, bans/unbans, report resolve/dismiss) with **resource IDs only — no content/PII** (COMPLIANCE §5.3). It is **written but not displayed anywhere**. Add a read-only admin-web view (paginated, filterable by action/actor/date) so owners have an accountability trail of "who did what, when". Read-only + IDs-only → low privacy risk. Distinct from the **Submissions** queue (that's user `reports`; this is the action log). Useful, not a blocker. |
| P-28 | Communities list UI → match `event-communities-screen.png` | 🎨 | 🟢 | The browse list (`CommunitiesSection` + `CommunityCard`) was built **functional-first** in Sprint 3 (#16): avatar + name + member count + description + a "Dołączono" badge — **before** the screen-by-screen UI pass. Polish to the mockup: a larger card, an actionable **Dołącz button on the card** for non-members (reuse the join/leave API + optimistic state; keep the joined badge for members), and the **category filter chips** (All/Support/Interests/Identity/Activism/Local) across the top. **Dependencies:** the "X online" presence count needs Realtime **presence** (lands with chat rich-features, P-24c) — omit or show members-only until then; the category chips need a new **community category/tag field** (schema + backend + filter param; coarse creator-chosen topic tags, never user protected-class inference — quick DPIA check). Part of the UI pass (with P-13). |
| P-29 | Chat composer media — GIFs, images, camera, polls | 🔒 | 🟡 | **Users expect rich chat.** **Emoji already works** (native keyboard → plaintext messages render them; an in-app picker is optional). The rest needs a **message media model** first — extend `messages` from text-only to a `messageType` ("text"/"image"/"gif"/"poll") + media fields/attachments (**schema → DPIA-gated**; Article 9). Then, in order: **(a) GIFs** — integrate **Giphy or Tenor** (API key; GIF is the provider's hosted URL → NO R2 upload), restrict to a PG content rating; **new third-party processor → GDPR disclosure + DPIA**. Highest-value, most achievable (no R2). **(b) Images + take-a-photo** — needs the **R2 media pipeline** (presigned upload, UUID filenames, private bucket, signed retrieval — CLAUDE.md storage) + `expo-image-picker`/camera; **gated on R2 provisioning** (also unblocks post images + avatars/community images — shared pipeline; image upload was deferred for posts too). **(c) Polls** — structured `type:"poll"` + `poll_votes` model + create/vote/results UI; lowest priority, defer. Content moderation: media messages reportable like text (the report flow already exists); GIF/image moderation reviewed in the queue. **Update (2026-06-27): GIFs TABLED** (client call) — **Tenor is shut down**; **Giphy** free-tier (no per-call price; + sub-processor sign-off + DPIA + strict PG content filter) **or** a **self-hosted curated Lottie/owned sticker set** (no sub-processor / no vendor risk / free) is preferred; **ad-based providers (e.g. Klipy) ruled out** (ads/tracking in a vulnerable audience's chat). Cannot scrape/re-host web GIFs (copyright). See [[chat-gifs-tabled]]. |
| P-30 | Seasonal Pride theme + Pride app icon (June) | 🎨 | 🟡 | **Pitch-deck design requirement** (was untracked): "Pride-themed UI activates only in June — the rest of the year it's calm and minimal." We ship light/dark + indigo/violet but **no June Pride theme switch**. **Open design decisions to resolve with the client BEFORE building:** (1) Is the Pride palette **always** a user-selectable option (light+dark), or only available/active in June? (2) **Activation mechanism** — a **remote flag** (admin/config the app reads → no store build needed) vs a **dated build push**? Strongly prefer **remote/config** so June activation needs no App Store release. (3) Auto-apply app-wide for June then revert? (4) **App icon** → Pride variant (iOS supports **alternate app icons without a new build**; Android is limited). (5) Light **and** dark Pride variants. (6) **🔒 SAFETY (critical):** the deck's "discreet by design" is in **direct tension** with auto-Pride-in-June — a closeted/at-risk user could be **outed** if their app suddenly turns rainbow. So the Pride theme MUST be **per-user opt-in** (or honour discreet mode) and **never forced**. The reusable `ThemeContext`/palette make a third palette feasible; the hard part is the policy above, not the code. |
| P-31 | News feed — LGBT news (Poland + EU) | 📬 | 🟢 | **Pitch-deck "Support & Education / Safety, News & Initiatives" pillar** (CLAUDE pillar 3 lists "news" but it's not sprinted). LGBT news from Poland & EU. Decide **content source**: curated/admin-published (clean, controlled) vs aggregated third-party feed (copyright + a processor + moderation of external content — heavier). Recommend **admin-curated** (a `news` table + admin CRUD + a mobile feed) for v1. Scope when the Support/News pillar is built. |
| P-32 | Community initiatives — anonymous surveys · statistics · volunteering | 📬 | 🟢 | **Pitch-deck "Safety, News & Initiatives"** (untracked): **anonymous surveys**, **statistics**, **volunteering opportunities**. Surveys → **anonymous response model** (responses NOT linkable to a user — privacy-by-design; Article 9 care); statistics → **aggregate/anonymised only**; volunteering → listings (reuse the safe-places/events content pattern + admin CRUD). Lower priority; scope when the initiatives pillar is built. |
| P-33 | Networking profile depth | 🎨 | 🟡 | The pitch deck frames profiles as a **networking** feature ("user profiles … networking across Poland"); the current profile is **minimal** (settings: theme, blocked users — no public, viewable profile). Likely expected: a viewable profile with **alias + bio/interests** (and maybe **city — city-level only**, COMPLIANCE §5.8). **🔒 Article 9 care:** "interests" can imply orientation/identity — keep optional, user-controlled, and decide what's shown to other users vs private; tie to the anonymity/alias model. Scope as a dedicated profile slice. |
| P-34 | One-time download/install fee (€1–2) | 📬 | 🟡 | **Pitch-deck revenue stream #1**: "€1–2 one-time, paid on install... filters trolls & bad actors; early revenue before subscriptions." Distinct from premium (**P-3** RevenueCat = subscriptions). This is **App Store / Play Store paid-app pricing** — a store-config + business decision, not really code. Decide: paid-app vs free-with-mandatory-first-run-IAP (the stores differ); regional pricing; **tension** — the "filters trolls" rationale vs friction for **closeted/low-income** users (the deck itself notes ads "lower the barrier for closeted users with limited funds"). Capture/confirm with the client before store submission (ROADMAP Sprint 7 store kickoff). |
| P-35 | Premium entitlements — what €3–5/mo unlocks | 📬 | 🟡 | **Pitch-deck revenue stream #2 (premium)**: the **perks aren't enumerated** anywhere — **ad-free**, **early event access**, **verified badge**, **exclusive forums**, **special Pride-Month features**. Subscription state syncs from RevenueCat (**P-3** webhook) but the **entitlement gating** (what `isPremium` actually unlocks) is unbuilt. Scope each: ad-free (ties to P-36), verified badge (a profile flag — ties to P-33), early event access (event gating — Sprint 6), exclusive/premium-only communities, Pride-Month premium features (ties to P-30). Build with the premium sprint. |
| P-36 | Curated ads + advertiser governance (free tier only) | 📬 | 🟡 | **Pitch-deck revenue stream #3**: ads on the **free tier only**, **curated LGBT-friendly brands**, **"you (owner) control who advertises."** `adCampaigns` table + `revenuecatWebhookIp` limiter scaffolded; the ad **system** is unbuilt — admin-curated **advertiser approval/inventory**, **free-tier-only** targeting (premium = ad-free, P-35), placements, and **🔒 NO third-party ad-network tracking** (privacy: serve owner-approved creatives **directly**, never a programmatic network that profiles a vulnerable audience). Fast-follow per ROADMAP, but track the governance model now. |
| P-37 | Support & Education content (pillar 3) | 📬 | 🟡 | **Pitch-deck pillar 3** (ROADMAP **Sprint 7** covers the API/screens, but the deck's specific content isn't enumerated): **LGBT rights guide**, **coming-out support**, **mental-health resources**, and **contacts to psychologists / organizations / hotlines** (≈ emergency contacts — content source still pending). Decide the content model (admin-curated `resources` + structured contacts) and the **🔒 safety bar** for hotline/crisis contacts — **accuracy is life-critical** (verified, Poland-specific, kept current). Build in Sprint 7. |
| P-38 | Content moderation at scale — reason-categories + appeals (generalized) + tiered automation | 🔒 | 🟡 | **The plan for moderating content as the app grows** (raised 2026-06-27). **Generalize the P-21/P-22 model from bans → content** (events/posts/messages): a mod picks a coarse, **behaviour-based `reasonCategory`** (never protected-class; never in `audit_log`) → a **templated, clear notice** to the creator + an **in-app appeal** (P-22). This resolves the tension between terse "violates guidelines" (users rage-quit) and custom prose every time (small team burnout). Add **content status** where needed (events: **active/paused/removed**) + a **pause-until-fixed** loop (creator fixes → admin/auto re-publish). **Notification = in-app primary** (the paused/removed item shows the reason + **Appeal** CTA) **+ a neutral, content-free `moderation_action` push** (🔒 lock-screen safety — never reveal the content; tap → in-app detail). An in-app **notifications inbox** (none today) is a likely prerequisite. **Roles:** community mods (per-community, distributed) **+** platform admins (the **client + his team**, admin portal) for the queue/escalations — **reporting-driven, NOT watch-everything** (a small team can't review all content; they triage reports + automated flags). **Automation roadmap (tiered, human-supervised, LGBT-aware):** v1 = human + reports (no AI needed at launch); growth = **keyword/rule filters** (slurs/doxxing/spam links, auto-queue); scale = **ML classifiers** (toxicity/NSFW) — but **NEVER auto-delete on AI alone**, and **🔒 tuned to NOT over-flag LGBT+ content** (off-the-shelf classifiers notoriously mis-flag queer terms/imagery as "adult" → would censor the very community we serve). Broadens **P-25** (admin message removal) into the general content-moderation surface; covers the **event-oversight** gap. |

| P-39 | 2026-07-01 security audit — findings + disposition | 🔒 | 🟡 | **Two independent audits** (Claude multi-agent sweep + parallel ChatGPT Codex), reconciled. **0 Critical.** **FIXED:** **AUTH-1** (Realtime chat ban/erasure bypass) → `fix/ban-realtime-revoke` #53; **RL-1/2/3** (six mutations missing a rate limiter: RSVP + event update + post/message/event delete + community leave) → `fix/mutation-rate-limits` #54; **IV-1** list endpoints threw on bad query params → 500 (now query `safeParse` → **400**), **TXN-1** `joinCommunity`/`leaveCommunity`/`blockUser`/`unblockUser` audit write wrapped in `db.transaction` (mutation+audit atomic; no phantom/double audit), **INJ-02** search terms **LIKE-escaped** via `likeEscape()`, **SEC-LOG-01** raw-error logs routed through `safeErrorCode` (extracted to `server/errorCode.ts`) / firebase logs name+message only → all in `fix/p39-hardening`. **PENDING (tracked, gated on other work):** **AUDIT-PRIV-1/GDPR-1** erasure nulls `actorId` but **retains the erased user's IP** on `audit_log` rows (null/coarsen `ipAddress` in erasure + build the mandated retention-purge job — controller/DPIA call); **TXN-2** `leaveCommunity` last-admin guard is a **read-then-write TOCTOU** (unreachable until multi-admin role management — fix with that slice); **SW-1** presigned R2 PUT URLs pin **no Content-Type/Length** (fix when the R2 upload pipeline is wired); **F-02/report-hardening** generic `POST /reports` accepts arbitrary/nonexistent `resourceId` (moderation-queue hygiene — fix with reason-categories **P-38**). |
| P-40 | Safe Places epic — sourcing, curation, map, submissions (multi-PR) | 📬 | 🟡 | **Sprint-7 "Events & Safe Places" pillar.** **Decisions locked (2026-07-03 grill):** source = **OSM browse + NGO seed** (admin browses OSM/Overpass POIs → bulk "Add to safe places", cross-checked with Polish LGBT-NGO lists: KPH, Lambda Warszawa, Miłość Nie Wyklucza, Tolerado, Trans-Fuzja); provider = **OpenStreetMap/Overpass** (free, storable, EU, no tracking — **never Google Places**: ToS forbids storing); images = **category art now** (branded gradient/illustration per category), real photos later via R2; user submissions = **fast-follow** after admin curation; in-app order = **city+category default, proximity ("near me") on location opt-in** (reuses the ephemeral `near` sort); geocoding = **Nominatim** (EU-hostable, admin-only manual/CSV entries); decline-with-reason reuses the moderation reason model (**P-38/P-21**). 🔒 **UGC + user-location are DPIA touchpoints.** 🎨 Client wants **premium UI on BOTH the admin portal AND mobile (iOS+Android)** for this feature — see [[ui-must-be-impeccable]]. **Backend shipped** (#60): read API + admin CRUD + `%3F` coord-leak fix. **Phases:** **SP-1** admin CRUD page (list/create/edit/soft-delete, category picker + art, optional coords) — *frontend-only, consumes #60*; **SP-2** admin **OSM browse + bulk-add** map panel (+ geocode + dedupe) — *the scaling engine; needs admin map tiles*; **SP-3** mobile **list** (filter + near-me, no map dep); **SP-4** mobile **map** (MapLibre + Poland **PMTiles on R2** + EAS dev-client, synced map↔list per `assets/safe-places-with-map.png`); **SP-5** user **"Suggest a safe place"** → moderation queue → approve/decline-with-reason; **SP-6** **real photos** (R2 image pipeline, shared with avatars/post images). |

### Accepted Risks

| # | Item | Cat | Notes |
|---|---|---|---|
| AR-1 | Admin dashboard stores the session token in `localStorage` | 🔒 Security | Accepted for the internal, owner-operated admin web app (`admin/`). `localStorage` is XSS-exposed; mitigated by the app being owner-only and the Helmet CSP. Revisit if the dashboard is opened to multiple staff or should move to an httpOnly-cookie session. Decided 2026-06-02. |
| AR-2 | Integration tests access the DB directly (`db`/`pool`) outside `storage.ts` | 🔧 Stability | Test-harness exception to the "all DB access via storage" rule (ENGINEERING_STANDARDS §7). `health.integration.test.ts` runs a raw `SELECT 1` to verify connectivity. Accepted for test code only; feature tests should prefer storage methods. Decided 2026-06-02. |

---

## 🚀 Production Infrastructure

| Service | Purpose | Region | Status |
|---|---|---|---|
| Fly.io | Express API server | Warsaw (waw) | Provision at project start |
| Supabase | PostgreSQL + Auth + Realtime | Frankfurt (eu-central-1) | Provision at project start |
| Cloudflare R2 | File storage | EU jurisdiction | Provision at project start |
| Upstash Redis | Rate limiting + auth cache | Frankfurt (eu-central-1) | Provision at project start |
| Firebase | Google Sign-In + FCM push | — | Provision at project start |
| Resend | Transactional email | — | Provision at project start — verify sender domain before any real users |
| Sentry | Error monitoring | EU data region | Provision at project start |
| RevenueCat | In-app subscriptions | — | Provision before premium feature goes live |
| Expo EAS | Mobile builds + OTA updates | — | Configure before first TestFlight/Play Store submission |

**Non-negotiable regions — set at creation, cannot be changed:**
- Supabase: Frankfurt (eu-central-1)
- Upstash: Frankfurt (eu-central-1)
- R2: EU jurisdiction bucket
- Fly.io: Warsaw (waw) primary region

See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 8 for the full provisioning sequence.

---

## Compliance

Blisko handles Article 9 special category data (sexual orientation) under GDPR. This is not a future concern — it applies from the moment the first user registers.

**Before writing any feature that touches user data, read `COMPLIANCE_AND_PRIVACY.md`.**

Key obligations that affect engineering:
- `consent_records` table required from migration 1
- `audit_log` table required from migration 1
- Every table needs explicit `ON DELETE` behaviour
- User deletion endpoint must anonymise, not just delete, and must call `invalidateProfileCache`
- Schema must not be locked before DPIA is complete
- Encryption decision is made: infrastructure-level only, no E2EE (moderation requirement)
- Location data: ephemeral queries only, no GPS coordinate persistence, city-level preference only

The client (Pretty Good Company) is the data controller. The development team is the data processor. A Data Processing Agreement must be signed between the two parties before any user data enters the system.
