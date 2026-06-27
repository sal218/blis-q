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
| P-8 | Password reset does not force-logout the user's other Supabase sessions | 🔒 | 🟡 | **Before beta.** Supabase admin lacks a clean bulk "revoke all sessions by userId" (needs a JWT). Revisit when sessions/refresh-token revocation is wired. After reset, old refresh tokens may remain valid. |
| P-9 | Reset/verification deep-link UI must not leak the token | 🔒 | 🟡 | **Addressed in `feat/auth-screens-mobile`:** `ResetPasswordScreen` captures the token once, scrubs it from navigation state via `setParams({ token: undefined })` and from the web URL via `history.replaceState`, and never logs it. **Re-verify** when universal/App Links replace the `blisq://` scheme at provisioning. |
| P-10 | Mobile session-token refresh | 🔒 | 🟡 | **Implemented in `feat/mobile-token-refresh`** (mid-session path). New `POST /api/v1/auth/refresh` exchanges the stored Supabase refresh token for a rotated session, reusing login's deleted/banned gates (deleted→401+revoke; banned→403 `account_suspended`+revoke; `bannedAt` off the DTO). Client: the shared `request()` chokepoint auto-refreshes on a 401 from an authenticated endpoint (single-flight, one retry; auth paths excluded so a bad-login 401 is untouched); on refresh failure the user is signed out to login with a "session expired" notice (`AuthContext.sessionExpired` → `LoginScreen`); banned-on-refresh → suspension screen. **Cold-start refresh added in `feat/cold-start-refresh`:** `loadSession()` now refreshes a genuinely-expired access token (valid past expiry + refresh token present) on app launch instead of signing out, so a returning user stays logged in across restarts (suspended-on-cold-start → login → re-gated by P-20). **Remaining follow-ups:** (a) don't sign out on a *transient network failure* at cold-start (today `refreshSession` collapses network/revoked/other into "failed" → cold-start clears; a launch-time offline blip forces re-login) — would need a distinct "offline" outcome; (b) surface the suspension screen directly on cold-start (vs via re-login); (c) pair with P-8 session revocation. |
| P-11 | Bottom-tab icons were emoji `Text` placeholders (`client/navigation/AppTabs.tsx`) | 🔧 | 🟢 | **Addressed in `feat/home-screen-shell`:** replaced with Phosphor v2 (regular) icons inlined as `react-native-svg` paths (`client/components/icons/PhosphorIcons.tsx`) — house · calendar-minus · chats-teardrop · user; active tab = brand-purple tint, taller bar with vertically-centered icon+label. Added `react-native-svg@15.12.1` (native module → **dev-client rebuild required**). |
| P-12 | "Continue with Apple" on the login screen is a visual placeholder (no handler) | 🔒 | 🟡 | **Before launch.** `LoginScreen` renders the Apple button per the design, but Sign in with Apple isn't implemented (needs `expo-apple-authentication` + the backend exchange). App Store Guideline 4.8 **requires** Apple sign-in once Google is offered, so this must ship before iOS release. |
| P-13 | Placeholder tab screens must be rebuilt from their mockups when their sprint lands | 🎨 | 🟡 | **Do not forget — sprint-aligned by decision (2026-06-14).** `ChatScreen` + the Events-tab Events/Safe-places segments are bare `ComingSoon` stubs. Build each from its `assets/*.png` mockup **with its backend**, replacing the stub: **Chat** (`chat-screen.png`, Sprint 5), **Events** (`events-screen.png`, Sprint 6), **Safe places** (`event-safeplace-screen.png`, Sprint 7). **Home shell built** in `feat/home-screen-shell` (greeting + live communities rail + placeholder sections) — the events/safe-places/activity rails fill in as those backends land; a reusable `SectionHeader`/`CommunityRailCard` kit was introduced for them to reuse. Light mode must match the mockups (mockups are light; dark = brand purple). **Related UI follow-ups:** tab-bar real icons (P-11, **done** — Phosphor SVG icons); the segment-aware "See all" nav from Home. |
| P-14 | Full prod↔schema parity pass + `check:rls` on prod before launch | 🏗️ | 🟡 | **Before launch.** The 2026-06-18 RLS/schema incident (`docs/DEPLOY.md`) showed prod schema sync had been ad hoc: prod was missing `password_reset_tokens`, and the test DB had RLS disabled on all tables — both now repaired. `db:push --force` is neutralized + `db:rls`/`check:rls` added (`fix/db-push-rls-safety`). Do a full parity sweep between the committed Drizzle schema and prod, and add `npm run check:rls` against prod to the launch checklist. |
| P-15 | Admin ban/unban user + `GET /admin/users` | 🔒 | 🟡 | **Implemented in `feat/user-ban`** (backend-only). `users.bannedAt` (additive) + gate integration: banned users are resolved but `isAuthenticated` → 403; GDPR export/erasure stay reachable via `isAuthenticatedAllowBanned`; erasure clears `bannedAt` + anonymises user-targeted audit `resourceId`. `GET /admin/users` + `/:id`, `POST /admin/moderation/ban`/`unban` (guarded atomic + audited + cache-invalidated). **Deploy:** apply `users.bannedAt` to prod via `docs/DEPLOY.md` after merge. `/mute` deferred (DPIA — API §12). |
| P-16 | Admin set-`isAdmin` (`PATCH /admin/users/:id`) | 🔒 | 🟢 | Admin **reports-queue** UI shipped (#27); admin-web **users/ban-unban UI** shipped (`feat/admin-users-web`, #29). Still pending: admin **set-`isAdmin`** (privilege escalation — own audit + guardrails). Ban `reason` storage is now scoped under **P-21** (`moderation_actions` table). |
| P-17 | Quick-exit + discreet-mode safety UI — **PAUSED** | 🔒 | 🟡 | Intentionally kept un-wired (`client/App.tsx` note — "do not re-add without sign-off"). `QuickExitProvider`/`QuickExitOverlay`/`QuickExitContext` exist but aren't mounted; no visible trigger. **Pending a client/product safety decision** — concern: a visible quick-exit/discreet trigger may create shame or become a "tell". Do not re-enable without explicit sign-off. |
| P-18 | Dedicated dev/staging DB for manual testing | 🏗️ | 🟢 | Manual device/dashboard testing currently hits the **prod** Supabase DB (the dev stack's `.env` points there); the CI test DB isn't safe to share (CI does broad cleanups). Stand up a third dev/staging Supabase project so manual testing never touches prod. Pre-launch nicety, not a blocker. |
| P-19 | Admin reports queue: hide "Usuń treść" when the post is already deleted | 🔧 | 🟢 | Deferred from `feat/admin-moderation-web` (#27). The reports list doesn't know a reported post's deleted state, so "Usuń treść" shows even when already removed → graceful 404 + reload. Clean fix: add a `resourceDeleted` flag to the admin reports list (small backend change) and hide the button. Low priority — current behavior is graceful. |
| P-20 | Mobile suspension UX (banned-user experience) | 🔒 | 🟡 | **Slice 1 of the Suspension & Appeals feature** (`docs/MODERATION_APPEALS.md`) — **implemented in `feat/mobile-suspension-ux`.** Additive `code: "account_suspended"` on the banned 403 (`server/auth.ts`) + **login gating** (email + Google handlers revoke session + audit `user.login_blocked_suspended` + 403 `code`; `getAccountProfile` gains `bannedAt`, off the DTO) → deterministic trigger. Client: `request()` chokepoint detects the code (monotonic suspension-generation guard) → `AuthContext` force-logout → top-level `AccountSuspendedScreen` (Polish, calm; env-gated `SUPPORT_EMAIL` appeal link + back-to-login). **Deferred (follow-ups):** export/delete CTAs (no mobile account-mgmt UI exists yet); deterministic cold-start/reopen probe (reopen is reactive on first gated call); push-token deregister backend (`/api/push-tokens` route absent). UI → device test before PR. |
| P-21 | Ban reason + suspension/reinstatement emails | 🔒 | 🟡 | **Slice 2** (`docs/MODERATION_APPEALS.md`). New **`moderation_actions`** table (DPIA-gated; add to `supabase/rls.sql`) storing a coarse, behaviour-based `reasonCategory` (**never** protected-class; never in `audit_log`). Ban/unban write it transactionally; post-commit **best-effort** discreet email (neutral subject — Article 9 shared-inbox safety). Real delivery gated on the **Resend verified domain (P-6)**. Erasure deletes target rows + nulls actor; export includes them sans `actorId`. |
| P-22 | Full in-app appeals (Instagram/Facebook-style) | 🔒 | 🟡 | **Slice 3** (`docs/MODERATION_APPEALS.md`; depends on P-20 + P-21). New **`appeals`** table (DPIA-gated). `POST/GET /api/v1/account/appeal` (banned-allowed, rate-limited) + admin `GET /admin/appeals` + `POST /admin/appeals/:id/decision` (guarded transition; grant → unban + email). Mobile appeal form on the suspension screen; admin Appeals queue page. Erasure deletes the user's appeals (free-text PII) + nulls reviewer. **Client owns** the appeal window/SLA + the `reasonCategory` policy. |
| P-23 | Moderation-specific delete copy in the feed | 🔧 | 🟢 | Deferred from `feat/mobile-mod-delete-posts`. A moderator deleting **another** member's post reuses the own-post confirm copy (`strings.posts.deleteConfirmTitle/Body`) and the generic "Usuń" label. If product wants moderation-specific wording (e.g. a distinct confirm or a "removed by moderator" tombstone), add it then. Cosmetic — the action + server authorization are unchanged. |
| P-24 | Community chat — mobile thread + Realtime auth (**slice 1 done**); inbox + rich features pending | 🔒 | 🟡 | **Thread + Realtime auth implemented in `feat/community-chat-thread` (P-24a):** `useCommunityChat` (HTTP history + private-channel subscribe with the mandatory lifecycle — focus+foreground only, `removeChannel` on blur/background; dedup; **client-side block-filter of live broadcasts**; gap-fill on resubscribe; optimistic send), `ChatThreadScreen` (inverted list + composer + delete/report), reached from a "Czat" button on the community screen. **Realtime auth:** `supabase/realtime-auth.sql` — RLS policy on Supabase-internal `realtime.messages` + `SECURITY DEFINER` member fn (app-table zero-policy unchanged); client `realtime.setAuth(userJWT)`. **Before PR (human):** live-Supabase auth spike (member subscribes / non-member + soft-deleted-community rejected — `docs/DEPLOY.md`) + on-device test; deploy `realtime-auth.sql` per `docs/DEPLOY.md`. **Mid-session subs are not force-disconnected on leave/ban** (next subscribe re-checks) — safety follow-up. Fallback if private channels are unworkable: opaque backend-issued channel token (no live revocation). **Still pending: P-24b** Messages inbox / Chat-tab root (`chat-screen.png`; replaces the placeholder); **P-24c** unread/read-state + rich features (reactions, images, pins, presence, search). |
| P-25 | Admin message removal (chat) | 🔒 | 🟢 | Admin-web "remove reported message" action. Reported messages already flow into the existing moderation queue; the queue's content-removal is **post-only** today (`adminRemovePost`). Add an admin message-removal path (own audit, guarded atomic, like `adminRemovePost`) + admin-web wiring when the chat moderation UI lands. |
| P-26 | Direct messages (1:1) — dedicated safety/DPIA-gated v1 slice | 🔒 | 🟡 | **In v1, after community chat.** Community-gated message-requests (no friend graph), block both directions, report DM message → moderation queue (report-gated + audited + DPIA-disclosed moderator access), admin remove/ban, rate limits, erasure/export, **no E2EE**, **no screenshots** in v1. New `conversations` + `direct_messages` tables + `new_direct_message` push (sender alias only). Reuses the Broadcast+Postgres foundation on `dm:{conversationId}`. **Schema not locked before the DPIA covers DMs.** Full scope: `docs/ROADMAP.md` + [[direct-messages-v1-scope]] memory. Ad-hoc group chats deferred post-v1. |
| P-27 | Admin moderator-actions view (surface `audit_log`) | 📬 | 🟢 | The `audit_log` already records every moderation action (post/message deletes, bans/unbans, report resolve/dismiss) with **resource IDs only — no content/PII** (COMPLIANCE §5.3). It is **written but not displayed anywhere**. Add a read-only admin-web view (paginated, filterable by action/actor/date) so owners have an accountability trail of "who did what, when". Read-only + IDs-only → low privacy risk. Distinct from the **Submissions** queue (that's user `reports`; this is the action log). Useful, not a blocker. |

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
