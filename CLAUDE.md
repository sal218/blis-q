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
* **Test runner:** `npm test` (unit, node:test) + `npm run test:integration` (Jest, real DB) + `npm run test:all` (both).

---

## Development Philosophy

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

**Launch target: August 20, 2026** (21-week engagement, started March 20, 2026).

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
* **Auth**: `auth.ts` — Supabase GoTrue (email/password + Google Sign-In via firebase-admin). Two-tier cache: JWKS local JWT verification + Redis profile cache (60s TTL, key: `profile:{userId}`)
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

**Every table must have explicit `ON DELETE` behaviour defined in its migration. No implicit defaults. See COMPLIANCE_AND_PRIVACY.md Section 5.2.**

**Schema must not be finalised until the DPIA is complete. See COMPLIANCE_AND_PRIVACY.md Section 4.**

### Authentication

* **Email/Password**: Supabase GoTrue
* **Google Sign-In**: Firebase client SDK → firebase-admin server verification → Supabase session
* **Token storage**: SecureStore (native) — Supabase session tokens
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
WEB_APP_URL                     # Expo web URL
```

---

## Known Gotchas

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
