# Transfer Context: Even Tab → Blisko

> **Who this file is for:** A Claude Code agent (or any developer) working inside the Blisko repository who needs to understand how to leverage an existing, production-hardened codebase — Even Tab (internal repo: `split-it`) — to accelerate building Blisko, without carrying over irrelevant logic, design, or product-specific assumptions.
>
> Read this file in full before writing any code. It encodes decisions and lessons that took months to arrive at in Even Tab. Starting from this foundation is the entire point.

---

## 0. Files That Belong in This Repository

When starting the Blisko repo, copy these two files from the Even Tab repo into the Blisko root:

| File | Purpose |
|---|---|
| `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` | This file — architecture decisions, what to port, chat design, setup sequence |
| `COMPLIANCE_AND_PRIVACY.md` | GDPR / Article 9 compliance reference — consult before any feature touching user data |

**Do not copy `CLAUDE.md` from Even Tab.** It is Even Tab-specific (issue tracker, commands, known gotchas). Instead, create a new `CLAUDE.md` for Blisko that:
1. Copies the **Security-First Operating Rules** block verbatim (sections 1–8 in Even Tab's CLAUDE.md — the non-negotiable rules)
2. Adds Blisko-specific commands, architecture notes, and issue tracker as the project grows

The security rules (RLS zero-policy, backend-only data access, no public buckets, input validation, rate limiting etc.) are universal and must be enforced in Blisko from day one.

---

## 1. Context: What is Even Tab and why does it matter here?

**Even Tab** (internal repo name: `split-it`) is a production React Native / Expo application for expense splitting between friends and groups. It was built by the same team using the same technology stack as Blisko. It has been through two full security audits, 87 tracked security and bug fixes, multiple performance optimisation rounds, and is live in production.

**Blisko** is a community platform for Poland's LGBT+ community — community groups, events, safe place discovery, support resources, and a premium membership model. It is a completely different product with its own design system, brand identity, and domain logic.

**The overlap is not at the product level. It is at the engineering level.** The same infrastructure, the same security patterns, the same authentication system, the same backend architecture — all of it was built, broken, fixed, and hardened in Even Tab. Blisko starts with those lessons already encoded.

The goal is not to import Even Tab's product. The goal is to not re-learn what Even Tab already proved.

---

## 2. Technology Stack

Even Tab and Blisko share the same core stack. The table below shows **Blisko's confirmed stack** — Even Tab uses Railway for hosting and Supabase Storage for files, but Blisko uses Fly.io and Cloudflare R2 for reasons documented below.

| Layer | Technology | Region / Notes |
|---|---|---|
| Mobile frontend | React Native + Expo SDK + TypeScript | — |
| Backend | Node.js + Express | Fly.io, Warsaw (waw) region |
| Database | PostgreSQL via Drizzle ORM | Supabase, Frankfurt (eu-central-1) |
| Auth | Supabase GoTrue | Same project as DB |
| Real-time / chat | Supabase Realtime (Broadcast mode) | Same project as DB |
| File storage | Cloudflare R2 | EU jurisdiction bucket |
| Rate limiting / caching | Upstash Redis | Frankfurt region |
| Transactional email | Resend | — |
| Push notifications | Firebase Cloud Messaging (firebase-admin) | — |
| CI/CD | GitHub Actions | — |
| Error monitoring | Sentry | EU data region |

**Why Fly.io instead of Railway:** Fly.io has a Warsaw (waw) node — Blisko's primary user base is in Poland. Lower latency for real-time chat and community interactions. Fly.io is also Docker-based, which means a future migration to AWS ECS or GCP Cloud Run is clean.

**Why Cloudflare R2 instead of Supabase Storage:** Blisko is media-heavy — profile photos, community covers, event banners. Supabase Storage charges AWS S3 egress rates (~$0.09/GB). R2 has zero egress fees. At 50K users the cost difference is material and grows with scale. Start with R2 from day one — migrating storage later is painful.

For every service listed above, Even Tab already has working configuration, battle-tested patterns, and resolved production issues. Blisko does not need to rediscover any of them.

---

## 3. What to Carry Over — and How

The sections below describe each area of reuse. Each one is labelled with how it should be reused:

- **VERBATIM** — copy the file, change almost nothing
- **ADAPT** — copy the structure and logic, update the content to fit Blisko
- **PATTERN ONLY** — do not copy code; understand the design and implement fresh for Blisko

---

### 3.1 Infrastructure Setup

**Approach: VERBATIM for config structure, new credentials per service**

Every infrastructure service must be provisioned with a **new Blisko-specific account/project**. Do not share Even Tab's Supabase project, Redis instance, Firebase project, or Resend API key. The configuration patterns are identical; the credentials are not.

**Non-negotiable provisioning decisions — set at creation, cannot be changed later:**

- **Supabase: Frankfurt (eu-central-1) region.** Blisko handles Article 9 special category data (sexual orientation). Data must not leave the EU. This is set at project creation and is irreversible. GDPR compliance depends on it.
- **Upstash Redis: Frankfurt region.** Select `eu-central-1` explicitly in the Upstash dashboard. The default is US East.
- **Cloudflare R2: EU jurisdiction bucket.** When creating the R2 bucket, select EU jurisdiction. This pins data and metadata to European infrastructure.
- **Fly.io: Warsaw (waw) region.** Deploy the Express API to Warsaw for lowest latency to Blisko's Polish user base. Set this in `fly.toml` — `primary_region = "waw"`.

**Fly.io setup notes (differs from Even Tab's Railway setup):**
- A `Dockerfile` is required (Fly.io is container-based). A standard Node.js Dockerfile is sufficient.
- A `fly.toml` config file replaces Railway's auto-detection.
- `app.set('trust proxy', 1)` is still required — Fly.io also sits behind a reverse proxy, and `req.ip` returns the proxy's internal IP without it. Rate limiting breaks without this.
- Even Tab uses `RAILWAY_PUBLIC_DOMAIN` env var in some build scripts. That does not apply here. Use `FLY_APP_NAME` or a custom `API_URL` env var instead.

**Cloudflare R2 setup notes:**
- Use separate buckets per asset type: `blisko-avatars`, `blisko-community-images`, `blisko-event-images`, `blisko-post-images`
- All buckets are private. Zero public buckets.
- Files accessed exclusively via signed URLs generated server-side.
- Filenames are always `crypto.randomUUID()` — never the original upload filename.
- Use an S3-compatible SDK (`@aws-sdk/client-s3`) — R2 is S3-compatible. The same patterns as Even Tab's object storage apply; only the endpoint and credentials differ.

**Upstash Redis:**
Required in production. Rate limiting is allow-all if Redis is absent. `validateEnv()` must enforce this — the server must refuse to start in production without Redis credentials. This is already implemented in Even Tab's `server/env.ts` and should be carried over verbatim (see Section 7).

---

### 3.2 Security Architecture

**Approach: VERBATIM — these rules apply to every app on this stack without exception**

This is the most important section. Even Tab's security model is not app-specific — it is a set of stack-level rules that took two audits and 87 tracked fixes to arrive at. Blisko starts with all of them in place from day one.

#### Rule 1: Backend-Only Data Access

The frontend is a view layer only. It renders UI, calls APIs, and does nothing else.

- **NEVER** access the database from the frontend using Supabase JS client methods (`.select()`, `.insert()`, `.update()`, `.delete()`)
- **ALWAYS** access data through server-side API routes or server actions
- If the frontend needs data → create a backend endpoint

This is the single most important architectural rule. Every violation creates a privilege escalation vector.

#### Rule 2: RLS Zero-Policy Model

Row Level Security is enabled on every table. No RLS policies are created.

RLS enabled with zero policies = deny-all for all roles. The `anon` key has zero access to all data. This is intentional.

All database access happens exclusively via the **service role key**, which bypasses RLS by design. The service role key is never sent to the client. It lives only in server environment variables.

**Never create an RLS policy.** If you find yourself writing `CREATE POLICY`, stop and design a backend endpoint instead.

#### Rule 3: Authentication Middleware

`isAuthenticated` in `server/auth.ts` is the gatekeeper for all protected routes. It:
1. Validates the Supabase JWT **locally using JWKS** (lazy-initialized on first request from `SUPABASE_URL`) — no Supabase network call per request
2. Checks a **Redis profile cache** (key: `profile:{userId}`, 60-second TTL) — on cache miss, loads profile from DB and writes to cache
3. **Checks `profile.deletedAt`** — if the account has been soft-deleted, returns 401 immediately
4. Attaches `req.user` with `{ id, email, name }` for downstream route handlers

**Profile cache invalidation (non-negotiable):** After any mutation that changes the user record (display name, email, `deletedAt`, `isPro`, preferences), you must call `invalidateProfileCache(userId)`. Failure to do this causes stale cached identities to persist for up to 60 seconds after the mutation. Add this call explicitly in every storage method that writes to the `users` table.

The two-tier caching pattern (Redis → DB) reduces per-request DB load significantly at scale and removes a synchronous network call from every authenticated endpoint. Replicate this pattern in Blisko's `server/auth.ts`.

Never bypass this middleware on routes that handle user data. Never trust `req.body.userId` when `req.user.id` is available — always use the authenticated identity.

#### Rule 4: Rate Limiting — Fail Closed, Dual Buckets

Rate limiting uses Upstash Redis via `@upstash/ratelimit`. Two critical design decisions:

**1. Fail closed:** If Redis is configured but temporarily unavailable, the `check()` function catches the error and returns `{ allowed: false, retryAfter: 60 }`. It does not allow the request through. This prevents an outage from opening the app to brute force attacks.

**2. Dual buckets on auth flows:** Authentication endpoints check **both** an IP bucket AND a user/email bucket. Both must pass. This prevents an attacker from cycling IPs to stay under the per-IP limit while hammering the same account, and prevents an attacker from abusing one account per IP to stay under the per-email limit. Example: login checks `loginIp` (10 req/15min) AND `loginEmail` (5 req/15min) — both checks must return `allowed: true`.

Reference starting values for Blisko's rate limiters:
- `loginIp`: 10 req / 15 min — `loginEmail`: 5 req / 15 min
- `signupIp`: 5 req / 1 hour
- `passwordResetIp`: 5 req / 15 min — `passwordResetEmail`: 3 req / 15 min
- `contentCreateUser`: 60 req / 1 min (community posts, messages — keyed by user ID)
- `reportUser`: 10 req / 1 hour
- `exportUser`: 5 req / 10 min

Authenticated endpoints should be keyed by user ID (not IP) so test users never share buckets.

In development (no Redis configured), rate limiting is disabled and requests are allowed through. `validateEnv()` prevents this state from reaching production.

#### Rule 5: Input Validation — Zod on Every Mutation

Every API endpoint that accepts a request body must validate that body against a Zod schema before doing anything else. No exceptions.

The pattern:
```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  // ...
});

const result = schema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ error: "Invalid input", details: result.error.issues });
}
const data = result.data;
```

Never trust `req.body` directly. Never use type assertions to cast unvalidated input.

#### Rule 6: Environment Variable Validation

`server/env.ts` validates all required environment variables at server startup using a Zod schema. If any required variable is missing, the server calls `process.exit(1)` with a clear error message.

**Startup call order in `server/index.ts` (non-negotiable):**
1. `validateEnv()` — absolute first statement, before any imports that read env vars
2. `validateAuthConfig()` — validates auth-specific config (Supabase URL format, JWT secret) before routes register
3. Everything else follows

In production, Redis credentials are required by a `superRefine` check. A server that starts without Redis is a server with disabled rate limiting — that must never happen in production.

#### Rule 7: Storage Security

- All uploaded files are renamed to `crypto.randomUUID()` before storage. The original filename is never preserved.
- Files are stored in private R2 buckets. Zero public buckets.
- Files are only accessible via presigned URLs (S3 GetObject presign). Never expose raw storage paths to clients.
- Signed URLs should have appropriate expiry times (15 min for upload grants, 1 hour for download links).
- **Upload pending claims must be stored in Redis** (with in-memory fallback for local dev only). A multi-instance Fly.io deployment would have in-memory claims fail silently across instances — only Redis-backed claims are safe in production.

#### Rule 8: HTTP Security Headers

Helmet middleware is applied in `server/index.ts` with a Content Security Policy. This sets:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- Content Security Policy restricting script/style/connect sources

Do not remove or relax the Helmet configuration.

#### Rule 9: Webhook Signature Verification

Any webhook endpoint (RevenueCat subscription events, etc.) must verify the request signature using the provider's official mechanism before processing the payload.

**Critical implementation detail:** Express's `express.json()` body parser re-serializes the request body before your route handler sees it. Signature verification requires the exact raw bytes of the request body, not the re-serialized JSON. Configure the body parser with a `verify` callback that stores the raw body on `req.rawBody`:

```typescript
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
```

Use `req.rawBody` (not `JSON.stringify(req.body)`) in webhook signature verification. If verification fails, return 400 immediately.

#### Rule 10: Transaction Boundaries

Multi-step database mutations (create + update + delete across multiple tables) must be wrapped in a database transaction. If any step fails, all steps roll back. This prevents partial-write corruption.

#### Rule 11: Request Logging — Sensitive Field Redaction

Any request logging middleware must explicitly redact sensitive fields before writing to logs. Maintain a blocklist that includes at minimum: `password`, `token`, `private_key`, `secret`, `authorization`, `access_key`. Never log `req.body` raw on mutation endpoints. Log the endpoint, method, status code, and duration — not the request payload.

---

### 3.3 Authentication System

**Approach: ADAPT**

The relevant file in Even Tab is `server/auth.ts`.

What to carry over:
- `isAuthenticated` middleware — adapt, not verbatim. The two-tier cache pattern (JWKS local verification + Redis profile cache) is the key architectural decision. See Rule 3 above for the full pattern.
- `optionalAuth` middleware — carries over near-verbatim for routes that serve both authenticated and unauthenticated users.
- `generateResetToken()` and `hashResetToken()` — cryptographic utilities using `crypto.randomBytes(32)` and SHA-256. Verbatim.
- `validateAuthConfig()` — verbatim.
- Supabase GoTrue for email/password auth — same setup.
- Google Sign-In via Firebase client SDK → `firebase-admin` server verification → Supabase session creation — same pattern. The `server/firebase-admin.ts` file is near-verbatim.

The `server/supabase.ts` file is verbatim — `supabaseAdmin` (service role, bypasses RLS, never sent to client) and `supabaseClient` (anon key, used only for operations that must return a user session like `signInWithPassword`). Both configured with `autoRefreshToken: false, persistSession: false`.

**Firebase Admin initialization pattern:** Check `admin.apps.length > 0` before re-initializing (idempotent). Graceful fallback: initialize with `projectId` alone if full credentials are missing (limits functionality to auth token verification only, not FCM sends). Private key requires `.replace(/\\n/g, "\n")` to unescape newlines from env var format.

**Important for Blisko specifically:** The auth system must support the anonymity model. Users in Blisko may choose to participate with an alias rather than their real name. The `req.user` object and the users table should be designed from the start to distinguish between `displayName` (public alias, always shown) and whatever identity fields are stored privately. Do not conflate them.

---

### 3.4 Push Notifications

**Approach: ADAPT**

The relevant files in Even Tab are `server/notifications.ts` and `client/notifications/usePushNotifications.ts`.

What to carry over verbatim:
- The `notifyUser` function's infrastructure: Firebase Admin multicast send, stale token deactivation loop, never-throws design, preference gate check
- The `notifyGroupMembers` pattern (fan-out to all members except one) — adapt to Blisko's concept of community members
- `usePushNotifications` hook — near-verbatim. The token registration/deregistration flow, token rotation listener (FCM rotates tokens periodically; the hook listens for this event), and foreground notification handler are all generic.
- The `device_push_tokens` and `notification_preferences` table structure — replicate for Blisko

What to update for Blisko:
- `NotificationType` union — replace Even Tab types (`new_expense`, `settlement_recorded`, `friend_request_accepted`) with Blisko types: `new_community_post`, `new_event`, `event_reminder`, `new_message`, `community_invite`, `new_member_joined`, etc.
- `buildMessage()` switch cases — rewrite message titles and bodies for Blisko events
- Preference keys — map Blisko notification types to user preference settings

**Critical Expo SDK note (Expo 54):** `setNotificationHandler` requires `shouldShowBanner: true` and `shouldShowList: true` in addition to the standard fields. Without these, foreground notifications do not display on some devices. This is an SDK 54 breaking change that was discovered and fixed in Even Tab.

**iOS note:** Zero server changes are needed to support iOS push notifications. Upload an APNs key to Firebase Console and add `aps-environment: production` to `app.json`'s iOS section. Firebase handles the relay from APNs tokens to FCM delivery.

---

### 3.5 Backend Architecture

**Approach: ADAPT the structure; write fresh content**

The backend structure from Even Tab that transfers to Blisko:

**`server/index.ts` — Express setup**

The startup order in `server/index.ts` is non-negotiable. Copy this exact sequence:
1. `validateEnv()` — first statement, no exceptions
2. `validateAuthConfig()` — before any auth-dependent middleware
3. CORS middleware (production: explicit allowlist only; development: localhost ports allowed)
4. Compression middleware
5. Helmet with CSP
6. Body parser with `rawBody` capture (required for webhook signature verification — see Rule 9)
7. Request logging with sensitive field redaction (see Rule 11)
8. `%3F` URL decode middleware (Resend encodes `?` as `%3F` in click-tracked email links — breaks Express route matching without this fix)
9. Health check endpoint (`GET /api/health`)
10. Route registration
11. Error middleware (must not re-throw after `res.json()` has been called — re-throwing after the response is sent crashes the Node process)

Also copy:
- `app.set('trust proxy', 1)` — required for correct IP resolution behind Fly.io's reverse proxy

Strip out all Railway-specific and Replit-specific code entirely.

**`server/storage.ts` — Repository Pattern**
Even Tab's `DatabaseStorage` class encapsulates all database queries behind named methods. All routes import a single `storage` singleton and call methods like `storage.getUser(id)`, `storage.createCommunity(data)`. No raw SQL or Drizzle queries appear in route handlers.

This pattern must be followed in Blisko. Create a `DatabaseStorage` class with Blisko-specific methods. Routes never touch the Drizzle client directly.

**`server/routes.ts` — Route Organisation**
All routes are registered via a single `registerRoutes(app)` function. Routes are grouped by domain (auth routes, user routes, community routes, event routes, etc.). `isAuthenticated` is applied per-route, not globally. This is intentional — some routes (public event listings, for example) may not require auth.

**`server/redis.ts`** — Verbatim copy. Exports a singleton Redis client or `null` if not configured. All callers must handle `null` gracefully (rate limiting allows-all in dev, cache writes are no-ops).

---

### 3.6 CI/CD Pipeline

**Approach: ADAPT**

The `.github/workflows/test.yml` from Even Tab defines a two-job pipeline that Blisko should replicate:

**Job 1: `fast-gate`** — runs on every PR push. Lint → type check → unit tests → server build. Completes in ~2-3 minutes. Blocks the integration job if it fails, avoiding unnecessary database time.

**Job 2: `integration-tests`** — runs after the fast gate passes. Uses the real Blisko test Supabase project (separate from production). Runs Jest + Supertest tests against a real database. Can be skipped by including `[skip integration]` in the commit message for UI/docs-only changes.

**Concurrency control:** `concurrency: cancel-in-progress: true` per branch — new commits cancel stale runs for the same branch. Prevents queue buildup.

What to update for Blisko:
- Remove Even Tab-specific env vars (exchange rate keys, `ENABLE_BILL_SPLIT_FLOW`, etc.)
- Add Blisko-specific env vars as they are defined
- Create a separate Supabase project for Blisko tests and store its credentials as GitHub Actions secrets

**Testing standard (non-negotiable):** Every bug fix and every security patch ships with a regression integration test on the same branch. The test and the fix are one atomic commit. No separate test branches. No "I'll add tests later."

---

### 3.7 React Native Platform Fixes

**Approach: VERBATIM — these are React Native framework-level behaviours, not app-specific**

These are hard-won fixes that apply to any React Native app on this stack. They will save hours of debugging per sprint if encoded from the start.

**Android:**
- `elevation: 0` on all tile/card components. Android 12+ (API 31+) Material You applies a white surface-tint overlay proportional to elevation. On near-transparent backgrounds, even low elevation values produce a solid white rectangle. iOS uses `shadow*` props which are unaffected by this. Use `Platform.select({ ios: { shadowColor, shadowOffset, ... }, android: { elevation: 0 } })`.
- `android_ripple={null}` on all `Pressable` components that use custom press feedback (scale animation, background colour change). The default Android ripple adds a white flash that conflicts with custom animations.
- `headerTransparent: Platform.OS === 'ios' ? transparent : false` — a transparent header on Android causes unreliable `useHeaderHeight()` values and content-clipping bugs. Use a solid header on Android.
- `fullScreenGestureEnabled: Platform.OS === 'ios'` — enabling full-screen gesture on Android causes the gesture recogniser to steal touch events from header buttons. Keep it iOS-only.
- Android modal inset floor: `Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 8)`. Modal screens (`presentation: "modal"`) return `insets.bottom = 0` on gesture-navigation Android even when the gesture bar is present.

**Cross-platform:**
- `hitSlop` on touchable elements must always be an object `{ top: N, left: N, bottom: N, right: N }`. A bare number is not supported consistently across platforms.
- For scroll views with a floating bottom element (tab bar, action button), use `style={{ marginBottom: clearanceValue }}` on the scroll container to clip the viewport above the floating element.

**TanStack Query patterns:**
- Never set `retry: false` on queries. `retry: false` means a single transient network failure permanently marks the query as errored for that session — the user sees an empty screen and must kill and restart the app. Use `retry: 3` minimum.
- Add `useFocusEffect` with `refetch()` for screens that show data that may have changed while the screen was off-stack.
- Always add `enabled: !!token` guards on queries that require authentication. Without this, queries fire during the brief window before the auth token is loaded and cache the 401 response as valid data.

---

### 3.8 Data Modelling Patterns

**Approach: PATTERN ONLY — understand the shape, design fresh for Blisko**

Even Tab's database schema is 100% Even Tab-specific and must not be used in Blisko. However, several data modelling patterns from Even Tab are directly applicable.

**Many-to-many membership pattern:**
Even Tab has `groups` and `groupMemberships` (user ↔ group junction table with `role`, `joinedAt`, `lastViewed`, etc.). Blisko's communities will follow the same shape: `communities` and `communityMemberships`. Design community membership with a role field from the start (member, moderator, admin) — retrofitting roles is painful.

**Soft delete:**
Even Tab uses a `deletedAt` timestamp column rather than hard-deleting records. Rows with `deletedAt IS NOT NULL` are excluded from all queries. The `isAuthenticated` middleware checks this field on the user profile. Blisko should soft-delete users, communities, and events.

**Notification preferences:**
`notification_preferences` table (one row per user, boolean column per notification type, default all-true). `device_push_tokens` table (one row per device, `userId`, `token`, `platform`, `isActive`). Replicate this structure exactly.

**Separate test database:**
The production database and the test database must be separate Supabase projects. Integration tests run against the test project using credentials in `.env.test` (gitignored locally, stored as GitHub Actions secrets). Never run integration tests against the production database.

---

### 3.9 Real-Time Chat Architecture

**Approach: NEW — no equivalent in Even Tab. Build using this specific pattern.**

Chat is a core Blisko feature and requires a deliberate architecture. This section documents the decisions made and the rationale.

#### Architecture: Supabase Realtime Broadcast + PostgreSQL

Do not use Postgres Changes for chat. Use Broadcast.

**Postgres Changes** listens to the PostgreSQL WAL (write-ahead log). Every message insert triggers WAL events fanned out to all subscribed clients. At scale this is heavy on the database — it is the right mechanism for "observe what changed" use cases, not high-frequency message delivery.

**Broadcast** is an ephemeral pub/sub layer that bypasses PostgreSQL entirely. It is purpose-built for real-time message delivery.

The correct pattern for Blisko chat:

1. Client subscribes to a Broadcast channel for the community they are currently viewing: `chat:{communityId}`
2. User sends a message → POST to Express API → message written to `messages` table in PostgreSQL (for durability and history) → API calls `supabase.channel('chat:{communityId}').send({ type: 'broadcast', event: 'new_message', payload: messageData })`
3. All subscribers on that channel receive the broadcast instantly
4. On screen open, message history is fetched via a standard HTTP API call — NOT via Realtime. Realtime only delivers new messages that arrive after the screen opens.

This separation is important: Realtime for delivery, HTTP for history.

#### Supabase Realtime + RLS Zero-Policy: Anon Key Clarification

The RLS zero-policy rule (Rule 2 in Section 3.2) states the anon key must have zero database access. This is correct. However, Supabase Realtime Broadcast mode **bypasses the database entirely** — it is a pure pub/sub layer, not a database operation. RLS does not apply to broadcast channels.

The client connects to Supabase Realtime using `EXPO_PUBLIC_SUPABASE_ANON_KEY`. This is the only context where the anon key is used client-side. This does not violate the zero-policy rule because no database rows are read or written through this connection. The anon key grants access to the Realtime pub/sub infrastructure only — all data access still goes through the Express API using the service role key.

#### Connection Lifecycle — Non-Negotiable Rules

These rules keep Supabase Realtime within the Pro tier's concurrent connection limits. They must be enforced in code, in a single hook, not scattered across screens.

```typescript
// client/hooks/useCommunityChat.ts — the only place subscriptions are managed
useEffect(() => {
  const channel = supabase.channel(`chat:${communityId}`)
  channel
    .on('broadcast', { event: 'new_message' }, handleNewMessage)
    .subscribe()

  return () => {
    supabase.removeChannel(channel) // runs on unmount AND navigate away
  }
}, [communityId])
```

**Rules:**
1. Subscribe only when the user is actively viewing a chat screen. Zero subscriptions on the home feed, community list, or profile screens.
2. Unsubscribe immediately when navigating away. The `useEffect` cleanup must always call `supabase.removeChannel()`.
3. Never subscribe to all communities a user is a member of simultaneously — only the one currently on screen.
4. Unsubscribe when the app goes to the background; resubscribe on foreground:

```typescript
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background') supabase.removeAllChannels()
    if (state === 'active') resubscribeToCurrentChannel()
  })
  return () => subscription.remove()
}, [])
```

#### Supabase Realtime Pricing — Important Note

Supabase Realtime pricing is based on concurrent connections. **Verify the exact current tier limits and overage model at supabase.com/pricing before finalising architecture** — pricing has been updated and the exact numbers should be confirmed from the source.

---

## 4. What NOT to Carry Over

This is equally important. The following things from Even Tab are entirely app-specific and must not influence Blisko.

**Design system and visual identity:**
- Even Tab uses a "glass" design system (blurred surfaces, floating dock, aurora backgrounds). Blisko has its own brand — deep indigo and violet, clean and minimal, pride themes only in June.
- `client/constants/glassSystem.ts`, `client/hooks/useGlass.ts`, `client/components/GlassDock` — do not port these.
- `client/constants/theme.ts` — Even Tab's colour tokens. Blisko defines its own.
- Any component that has glass, aurora, shimmer, or gradient styling baked in.

**Product domain logic:**
- Everything related to expenses, settlements, balances, currency conversion, pot groups, personal finance goals — none of this exists in Blisko.
- The friends/invites system as implemented (friend requests with bilateral approval) — Blisko has a different social model.
- Bill splitting, group lifecycle (soft delete/restore), expense participants — entirely Even Tab-specific.

**Even Tab's issue tracker and bug history:**
- The 87 tracked issues in Even Tab's CLAUDE.md describe Even Tab's bugs. They are not Blisko's bugs.

**Replit/Railway legacy code:**
- Any reference to `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `RAILWAY_PUBLIC_DOMAIN`, `configureExpoAndLanding`, or the Metro HTTP proxy — remove entirely.

---

## 5. Blisko-Specific Requirements — Build from Day One

These are requirements specific to Blisko that have no equivalent in Even Tab. They must be designed correctly from the start.

> **Full compliance reference:** See [COMPLIANCE_AND_PRIVACY.md](COMPLIANCE_AND_PRIVACY.md) for the complete technical requirements covering Article 9 GDPR, DPIA obligations, consent records, erasure procedures, audit logging, encryption posture, and the developer vs. client responsibility split.

### 5.1 GDPR Compliance (Non-Negotiable)

Blisko serves users in Poland and the EU. GDPR applies in full.

- **Data residency:** Supabase project must be in the EU region. This is set at project creation and cannot be changed.
- **Data minimisation:** Only collect data that is strictly necessary for the feature.
- **Right to erasure:** Users must be able to delete their account and have all personal data removed or anonymised.
- **Privacy policy:** Must exist and be linked from the app before any data is collected.
- **Consent:** Any use of analytics or non-essential data collection requires explicit user consent.

### 5.2 Anonymity Model

Blisko users may choose to participate without revealing their real identity. This is a safety feature, not a cosmetic option.

Design decisions that must be encoded from the start:

- Users have a `displayName` (public alias, always shown) that is separate from any real-name or email identity.
- Registration should require minimal real-world identity — email for account recovery is reasonable; requiring a real name is not.
- The `req.user` object on the backend carries `id` and `email` (for account management only). Route handlers that render community-facing content use `displayName`, not email.
- Consider whether any user-to-user features ever expose one user's account identity to another. The default should be the alias, not the identity.

### 5.3 Content Moderation and Safety

Blisko serves a community that may be targeted by bad actors.

- Every user-generated content endpoint (post, comment, message) must have a corresponding report endpoint.
- Reports go into a moderation queue.
- Rate limiting on content creation endpoints must be tighter than typical.
- Implement block/mute functionality from the start. Retrofitting it means touching every content query.

### 5.4 Quick-Exit Feature

A one-tap button that instantly masks the app — switches to a neutral-looking screen or the device home screen. This is a UI safety feature for users who need to hide the app quickly.

**This is a first-class feature, not an afterthought.** It must be accessible from every screen.

**Technical implementation pattern:**
- Use a full-screen `View` overlaid on the root navigator, set to `display: 'none'` by default
- On trigger: flip to `display: 'flex'` with **no animation** — speed is the point, any animation is a tell
- Content options: a neutral-looking screen (weather widget mock, notes mock) OR `Linking.openURL('http://')` to jump to the browser (simpler, more reliable)
- The trigger button must be mounted at the root navigator level, not inside individual screens — it must appear on every screen without each screen needing to know about it
- Use a `React.Context` to expose `triggerQuickExit()` down the tree so deep screens can also trigger it programmatically if needed
- **Never use `navigation.navigate()` to show the exit screen** — navigation is async and may not fire instantly
- **Never use a Modal** — modals have entrance animations that are visible and defeat the purpose
- Test on a real device: the switch must be imperceptible even when the app has heavy content rendered

### 5.5 Payment Architecture (RevenueCat)

Blisko's premium subscription and download fee must go through Apple's App Store and Google Play billing.

The correct tool is **RevenueCat**. It provides a single React Native SDK that abstracts both stores, handles receipt validation server-side, manages subscription state, and provides a dashboard for analytics.

RevenueCat sends webhook events to your backend when subscriptions are created, renewed, cancelled, or lapse. These webhooks must verify the RevenueCat signature (via the `Authorization` header secret) before processing. Store subscription state in the Blisko database, keyed by user ID. The `rawBody` capture pattern (Rule 9 in Section 3.2) is required to verify RevenueCat signatures.

---

## 6. CLAUDE.md Guidance for Blisko

The following rules should be encoded in Blisko's `CLAUDE.md` from the start.

### Security Rules (Non-Negotiable)

```
1. NEVER write business logic in Client Components.
2. NEVER use database client SDKs directly in the frontend.
3. ALWAYS access data through Backend APIs only (API routes, server actions).
4. RLS IS MANDATORY on every table. NO RLS POLICIES ARE ALLOWED. Zero-policy = deny-all.
5. The anon key must have ZERO database access. Supabase Realtime Broadcast is the only client-side use of the anon key — it bypasses the DB entirely and does not violate this rule.
6. ALL database access via service_role only, inside backend APIs.
7. NO PUBLIC STORAGE BUCKETS. UUID filenames only. Signed URLs only.
8. Validate ALL inputs at the backend boundary with Zod schemas. No exceptions.
9. RATE LIMIT ALL MUTATIONS. Auth endpoints: dual IP + user/email buckets. Content endpoints: keyed by user ID.
10. Redis rate limiting must FAIL CLOSED. Never allow-all on Redis error in production.
11. validateEnv() must be the first call in server/index.ts. validateAuthConfig() must be the second. Fail fast on missing vars.
12. Redis is REQUIRED in production. Server must refuse to start without it.
13. Webhook endpoints (RevenueCat) must verify signatures using req.rawBody (not req.body). Return 400 on failure.
14. Multi-step DB mutations must use transactions. No partial writes.
15. Never log secrets, tokens, passwords, or PII. Request logging must redact sensitive fields explicitly.
16. After any mutation to the users table, call invalidateProfileCache(userId). Stale cache causes stale auth identities for up to 60 seconds.
17. Upload pending claims must be Redis-backed (in-memory fallback for local dev only). Fly.io multi-instance deploys break in-memory claims silently.
```

### GDPR Rules

```
1. Supabase project MUST be in EU region. Data must not leave the EU.
2. Collect only data necessary for the feature. No speculative data collection.
3. Users must be able to delete their account and all associated personal data.
4. Any analytics or non-essential tracking requires explicit user consent.
5. Privacy policy must exist and be linked before any data is collected.
```

### Anonymity Rules

```
1. displayName (public alias) is always shown in community-facing UI. Never expose email or real name to other users.
2. The req.user object carries id and email for auth purposes only.
3. Route handlers that return community-visible content use displayName, not identity fields.
4. Default to minimum viable identity. Do not require real names at registration.
```

### Testing Rules

```
1. Every bug fix ships with a regression integration test on the same branch.
2. Test and fix are one atomic commit. No separate test branches.
3. Integration tests use the real Blisko test DB (separate Supabase project).
4. Always run npm run test:integration before reporting a fix complete.
5. CI runs on every PR. All tests must pass before merge.
```

### React Native Rules

```
1. elevation: 0 on all Android tile/card components. Never use elevation on Android for transparent backgrounds.
2. android_ripple={null} on Pressables with custom press feedback.
3. headerTransparent: Platform.OS === 'ios' only. Android uses solid headers.
4. fullScreenGestureEnabled: Platform.OS === 'ios' only.
5. hitSlop must always be an object {top, left, bottom, right}. Never a bare number.
6. retry: 3 minimum on TanStack Query. Never retry: false.
7. enabled: !!token guard on all authenticated queries.
8. useFocusEffect refetch on screens that show data that may have changed off-stack.
```

### Engineering Standards

```
1. Never work directly on the main branch. Always create a feature/fix branch first.
2. The frontend is a view layer only. If the frontend needs data, create a backend endpoint.
3. Validate env vars at startup. The server must not start with missing configuration.
4. Never hardcode secrets. Never commit secrets. Use process.env.VAR_NAME.
5. Keep components focused. Do not put business logic in React components.
6. Repository pattern: all DB queries go through DatabaseStorage methods. No raw queries in route handlers.
```

---

## 7. File-by-File Porting Reference

Use this as a checklist when setting up the Blisko repository. The Even Tab file paths are given for reference — check those files directly when adapting.

| Even Tab File | Action | Notes |
|---|---|---|
| `server/redis.ts` | VERBATIM | Change prefix from `"splitit"` to `"blisko"` in rateLimit.ts |
| `server/supabase.ts` | VERBATIM | New Supabase project credentials. Both clients: `autoRefreshToken: false, persistSession: false` |
| `server/firebase-admin.ts` | VERBATIM | New Firebase project credentials. Idempotent init check (`admin.apps.length > 0`). |
| `server/auth.ts` | ADAPT | Port the two-tier cache pattern (JWKS local verification + Redis profile cache). Near-verbatim except `req.user` type and profile fields. Update `invalidateProfileCache` call sites. |
| `server/notifications.ts` | ADAPT | Copy all infrastructure. Rewrite `NotificationType` union and `buildMessage()` for Blisko events. |
| `server/env.ts` | ADAPT | Copy pattern. Keep Supabase, Firebase, Redis, Resend vars. Remove Even Tab-specific vars. Add R2 vars, RevenueCat webhook secret, Blisko-specific vars. |
| `server/rateLimit.ts` | ADAPT | Copy `makeLimiter`, `check`, `getIp`, `RateLimitResult`. Rewrite `limiters` object for Blisko endpoints. Use dual IP + email buckets for auth flows. |
| `server/index.ts` | ADAPT | Copy startup order (validateEnv → validateAuthConfig → CORS → Helmet → rawBody capture → logging → %3F fix → routes → error handler). Remove all Railway/Replit code. Use Fly.io env vars. |
| `server/objectStorage.ts` | ADAPT | Rewrite using `@aws-sdk/client-s3` for R2. Same patterns: UUID filenames, presigned upload URLs, presigned download URLs, private buckets. Redis-backed pending claims (not in-memory). |
| `server/storage.ts` | PATTERN ONLY | Replicate the DatabaseStorage class pattern. Write all methods fresh for Blisko's schema. |
| `server/routes.ts` | PATTERN ONLY | Replicate `registerRoutes` structure. Write all routes fresh for Blisko. |
| `server/validation.ts` | PATTERN ONLY | Replicate Zod schema pattern. Write all schemas fresh for Blisko. |
| `server/db.ts` | ADAPT | Drizzle setup is the same. Update schema import path. |
| `server/email.ts` | ADAPT | Resend SDK setup is the same. Rewrite all email templates for Blisko. |
| `client/notifications/usePushNotifications.ts` | ADAPT | Near-verbatim. Update API endpoint paths. Ensure token rotation listener is included. |
| `.github/workflows/test.yml` | ADAPT | Copy two-job structure. Update env vars for Blisko. Remove Even Tab-specific flags. |

**Do not port:**
- Any screen files from `client/screens/` (Even Tab product screens)
- `client/constants/glassSystem.ts` — Even Tab-specific glass design system
- `client/hooks/useGlass.ts` — Even Tab-specific
- `client/constants/theme.ts` — Even Tab colour tokens; Blisko defines its own
- `shared/schema.ts` — Even Tab schema; Blisko writes its own from scratch
- `server/exchangeRates.ts` — expense-splitting feature, irrelevant to Blisko
- `server/objectAcl.ts` — Even Tab-specific ACL logic
- `server/featureFlags.ts` — Even Tab feature flags
- `server/personalPeriod.ts`, `server/friendshipGroups.ts`, `server/groupLifecycle.ts`, `server/expenseSettlementAuthorization.ts` — all Even Tab product logic

---

## 8. Setting Up the Blisko Repository — Recommended Sequence

**How to move from Even Tab to Blisko:** Do NOT clone the Even Tab repository. Create a brand new empty GitHub repository for Blisko. The transfer is pattern-based, not a git history transfer. Even Tab stays untouched.

**Before starting the first Claude session, you (the developer) do one manual step:** copy 12 specific files from Even Tab into the Blisko repo. Claude will then adapt them in place — this is faster and more accurate than having Claude reconstruct security-critical code from documentation alone.

**Copy verbatim (Claude only updates credential references):**
```
server/redis.ts
server/supabase.ts
server/firebase-admin.ts
```

**Copy as starting point (Claude adapts for Blisko):**
```
server/auth.ts
server/env.ts
server/rateLimit.ts
server/index.ts
server/notifications.ts
server/db.ts
server/email.ts
client/notifications/usePushNotifications.ts
.github/workflows/test.yml
```

Do not copy anything else from Even Tab. No screens, no schema, no product files.

The full Claude session workflow is documented in `BLISKO_STARTER_PROMPT.md`. Run that prompt after the 12 files and 3 `.md` files are in place.

The setup sequence follows:

**Full setup sequence (do not skip steps):**

1. **Initialise the repo structure** — monorepo with `client/`, `server/`, `shared/` directories. Same `tsconfig.json`, `babel.config.js`, and path alias configuration (`@/*` → `./client/*`, `@shared/*` → `./shared/*`, `@assets/*` → `./assets/*`).

2. **Create `CLAUDE.md`** — encode all security rules, GDPR rules, anonymity rules, testing rules, React Native rules, and engineering standards from Section 6 of this document.

3. **Provision infrastructure** — all new accounts/projects, all in EU regions:
   - Supabase: new project, Frankfurt (eu-central-1)
   - Upstash Redis: new instance, Frankfurt (eu-central-1)
   - Cloudflare R2: new buckets (`blisko-avatars`, `blisko-community-images`, `blisko-event-images`, `blisko-post-images`), EU jurisdiction
   - Firebase: new project (FCM + Google auth)
   - Fly.io: new app, Warsaw (waw) region, `fly.toml` with `primary_region = "waw"`
   - Create a `Dockerfile` for the Express server

4. **Port the verbatim files** — `server/redis.ts`, `server/supabase.ts`, `server/firebase-admin.ts`. Update credentials references only.

5. **Port and adapt the infrastructure files** — `server/env.ts`, `server/auth.ts` (with two-tier cache pattern), `server/rateLimit.ts` (with dual buckets), `server/index.ts` (with rawBody capture, remove Replit/Railway code, update CORS for Fly.io).

6. **Write `server/objectStorage.ts`** — implement R2 storage using `@aws-sdk/client-s3`. UUID filenames, presigned upload and download URLs. Private buckets only. Redis-backed upload pending claims.

7. **Set up the CI/CD pipeline** — adapt `.github/workflows/test.yml`. Create the Blisko test Supabase project and add its credentials as GitHub Actions secrets.

8. **Define the Blisko schema** — design `shared/schema.ts` for Blisko's domain: users (with displayName, isAnonymous), communities, communityMemberships, events, eventRsvps, posts, messages, safe_places, reports, device_push_tokens, notification_preferences, consent_records, audit_log, subscriptions. Apply the data modelling patterns from Section 3.8. **Every table that references users must have explicit ON DELETE behaviour defined. Schema must not be finalised until DPIA is complete — see COMPLIANCE_AND_PRIVACY.md Section 4.**

9. **Create `server/storage.ts`** — implement DatabaseStorage with Blisko-specific methods, following the repository pattern.

10. **Port `server/notifications.ts`** — copy infrastructure, define Blisko notification types, write message templates.

11. **Port `client/notifications/usePushNotifications.ts`** — update API paths.

12. **Begin Sprint 1 feature work** — auth routes, onboarding, core navigation. The security infrastructure is already in place.

---

*This document was generated from a thorough review of the Even Tab codebase (internal repo: `split-it`) representing 87 tracked security and bug fixes across two full security audits. Every security rule listed in Section 3.2 corresponds to a real vulnerability that was found and fixed in Even Tab. Last reviewed: May 2026.*
