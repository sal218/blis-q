# Blis-Q API Contract (v1)

> **Status: locked contract, not implementation.** This is the agreed HTTP interface between the clients (Expo mobile app + admin web dashboard) and the Express API. Mobile and admin build against it with mocks; the backend implements it. Changes happen by PR, not ad hoc.
>
> Source of truth alongside `shared/schema.ts` (data shapes), `server/validation.ts` (request Zod schemas), `shared/types.ts` (DTOs/envelopes), `CLAUDE.md` (security rules), and `COMPLIANCE_AND_PRIVACY.md`. Where this doc and code disagree, fix one to match — don't let them drift.
>
> 🚧 **Provisional (pending DPIA):** fields marked `🚧` may change once the DPIA completes (COMPLIANCE §4). Don't treat them as final.
> ⛔ **Deferred:** direct messages are out of v1 scope (see `[[direct-messages-deferred]]`); no DM endpoints are defined.

---

## 1. Conventions

### Base paths

- **Product API:** every product route is under **`/api/v1`** (e.g. `/api/v1/communities`).
- **Ops:** `GET /api/health` is **unversioned** (infra/ops liveness probe, used by Fly.io health checks).
- Scaffold routes currently on flat paths (`/api/admin/me`, `/api/push-tokens`) are documented here at their **intended final `/api/v1/...` paths** and will migrate when those modules are built — they are not churned pre-emptively.

### Transport

- JSON only. `Content-Type: application/json` on requests with a body.
- **Auth header:** `Authorization: Bearer <supabase-access-jwt>`. The server verifies the JWT locally via JWKS (no Supabase round-trip) and resolves `req.user`.
- **Timestamps:** ISO-8601 UTC strings, e.g. `"2026-06-06T12:00:00.000Z"`.
- **IDs:** UUID v4 strings.
- **All request bodies are validated with Zod** at the boundary before anything else (CLAUDE.md §6). Body schemas are **`.strict()`** — unknown/extra keys are **rejected** (`400`), not silently stripped. **Query strings are parsed leniently** — unrecognised query params are ignored, not rejected.
- **Path notation:** within each section, paths in the table are relative to the section's base path (shown in the heading); a row showing a full `/api/v1/...` path means its base differs from the section.

### Auth matrix (every endpoint is exactly one of these)

| Class             | Marker | Mechanism                                                                                    |
| ----------------- | ------ | -------------------------------------------------------------------------------------------- |
| **Public**        | 🌐     | No auth.                                                                                     |
| **Authenticated** | 🔑     | `isAuthenticated` — valid Supabase JWT; `req.user` populated; rejects soft-deleted accounts. |
| **Admin**         | 🛡️     | `isAuthenticated` **then** `requireAdmin` — `req.user.isAdmin === true`, else 403.           |
| **Webhook**       | 🪝     | No JWT. Provider signature verified against `req.rawBody` (see RevenueCat).                  |

### Error envelope (always this shape — ENGINEERING_STANDARDS §6)

```jsonc
{
  "error": "Human-readable, non-sensitive message",
  "details": [
    /* optional, e.g. Zod issues */
  ],
}
```

Client-facing errors never leak internal detail (stack traces, SQL, file paths). The server logs the full error; the client gets a generic message.

| Status | When                                                             | Body                                                                      |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `400`  | Validation failure                                               | `{ "error": "Invalid input", "details": ZodIssue[] }`                     |
| `400`  | Webhook signature invalid                                        | `{ "error": "Invalid signature" }`                                        |
| `401`  | Missing/invalid token                                            | `{ "error": "Unauthorized" }` / `{ "error": "Invalid or expired token" }` |
| `403`  | Authenticated but not allowed (non-admin, non-member, non-owner) | `{ "error": "Forbidden" }`                                                |
| `404`  | Resource not found (or not visible to caller)                    | `{ "error": "Not found" }`                                                |
| `409`  | Conflict (e.g. already a member, email in use)                   | `{ "error": "..." }`                                                      |
| `429`  | Rate limited (fail-closed)                                       | `{ "error": "Rate limit exceeded", "retryAfter": <seconds> }`             |
| `500`  | Unexpected server error                                          | `{ "error": "Internal Server Error" }`                                    |

### Pagination

**Cursor pagination** — user-facing recency-ordered feeds (posts, messages, event timeline, community activity). Stable under inserts.

```
Request:  ?limit=<1..50, default 20>&cursor=<opaque string | omitted>
Response: { "data": T[], "nextCursor": string | null }   // null ⇒ end of list
```

The cursor is opaque (server-encoded `createdAt`+`id`); clients pass `nextCursor` back verbatim and never parse it.

**Offset/page pagination** — admin tables and catalog/search (filter + sort + export workflows).

```
Request:  ?page=<1-based, default 1>&pageSize=<1..100, default 25>&sort=<field>&order=asc|desc + filters
Response: { "data": T[], "page": number, "pageSize": number, "total": number, "totalPages": number }
```

### Rate limiting

Per CLAUDE.md §6 / `server/rateLimit.ts`. Fail-closed (Redis outage → 429 in prod). Auth flows use **dual buckets** (IP **and** email/userId — both must pass). Limiter names referenced per-endpoint below: `loginIp`/`loginEmail`, `signupIp`, `googleAuthIp`, `passwordResetIp`/`passwordResetEmail`, `contentCreateUser`, `reportUser`, `communityJoinUser`, `pushTokenUser`, `accountUpdateUser`, `changePasswordUser`, `exportUser`, `eraseUser`, `revenuecatWebhookIp`.

---

## 2. Core DTOs (see `shared/types.ts`)

- **`PublicUser`** — what other users see (anonymity model, CLAUDE.md §anonymity): `{ id, displayName, avatarUrl }`. **Never includes `email`.**
- **`AccountProfile`** — the authenticated caller's own account: `{ id, email, displayName, avatarUrl, isPremium, isAdmin, preferredCity, createdAt }`.
- **`SessionResponse`** — returned by signup/login/google: `{ user: AccountProfile, session: { accessToken, refreshToken, expiresAt } }`. Mobile stores tokens in SecureStore.
- Resource DTOs (`CommunityDTO`, `PostDTO`, `MessageDTO`, `EventDTO`, `SafePlaceDTO`, `ReportDTO`, `SubscriptionDTO`, `AdDTO`, `NotificationPreferencesDTO`) are defined in `shared/types.ts`. Author/sender fields are always `PublicUser`, never raw user rows. Dates are ISO strings.

---

## 3. Ops

| Method | Path          | Class | Notes                                                                             |
| ------ | ------------- | ----- | --------------------------------------------------------------------------------- |
| GET    | `/api/health` | 🌐    | Liveness. `{ "status": "ok", "timestamp": <ISO> }`. Unversioned. **Implemented.** |

---

## 4. Auth — `/api/v1/auth`

| Method | Path                   | Class | Rate                                             | Body                                                                 | Success                                                                     |
| ------ | ---------------------- | ----- | ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/signup`              | 🌐    | `signupIp`                                       | `RegisterInput`                                                      | `202 { ok: true }`                                                          |
| POST   | `/resend-verification` | 🌐    | `resendVerificationIp`+`resendVerificationEmail` | `{ email }`                                                          | `202 { ok: true }`                                                          |
| POST   | `/login`               | 🌐    | `loginIp`+`loginEmail`                           | `{ email, password }`                                                | `200 SessionResponse`                                                       |
| POST   | `/google`              | 🌐    | `googleAuthIp`                                   | `{ idToken, accessToken?, nonce?, consentedTypes?, policyVersion? }` | `200 SessionResponse` · `422 { error: "consent_required" }` (first sign-up) |
| POST   | `/forgot-password`     | 🌐    | `passwordResetIp`+`passwordResetEmail`           | `{ email }`                                                          | `202 { ok: true }`                                                          |
| POST   | `/reset-password`      | 🌐    | `passwordResetIp`                                | `{ token, newPassword }`                                             | `200 { ok: true }`                                                          |

**Compliance — signup MUST capture consent.** `RegisterInput = { email, password, displayName, consentedTypes: ConsentType[], policyVersion }`. The handler creates the user, **writes `consent_records`** (at minimum `account_creation`), seeds default `notification_preferences`, and writes `audit_log: user.registered` — **atomically (one DB transaction)**. A signup without a recorded consent row is invalid (COMPLIANCE §5.1). Consent is explicit and affirmative — the client must not pre-tick.

**Signup is verification-first and enumeration-resistant:**

- Returns a **uniform `202 { ok: true }`** for both new and existing emails, and **never returns a session** — so account existence (an Article 9 signal: having a Blis-Q account reveals orientation) is never leaked. The client calls `/login` separately after the user verifies.
- New users are created **unconfirmed**; the verification email is sent **only after** the DB transaction succeeds (no email for a half-initialised account). If the DB tx fails after the Supabase auth user is created, the auth user is **rolled back** (deleted).
- **Login only succeeds after email verification** — Supabase rejects unverified accounts, surfaced as the same generic `401` as bad credentials.
- **`/resend-verification`** re-sends the verification email if the first is lost — uniform `202` (no enumeration), dual-bucket rate-limited, and sends only for a real, non-deleted account (Supabase no-ops if already verified).
- A login blocked by a **soft-deleted/missing local profile** also **revokes the Supabase session** (global sign-out) and writes `audit_log: user.login_failed`.
- Sprint 1 uses **Supabase's built-in verification email**; switching to branded Resend on the verified domain is tracked (CLAUDE.md **P-6**) and does not change this auth model.

**Google Sign-In exchanges a Google OIDC token for a Supabase session (Option A):**

- The mobile app obtains a Google **ID token** and posts it; the backend calls `supabaseClient.auth.signInWithIdToken({ provider: "google", token: idToken })`, so **Supabase verifies the token** (signature/audience/expiry against Google) and owns the session. `firebase-admin` is **not** used for this — Firebase remains only for FCM push. `accessToken` and `nonce` are **optional pass-throughs** for native flow variants (nonce-bound sign-in; flows that require the access token alongside the ID token).
- **Returning user** (local profile exists, not deleted) → `200 SessionResponse`; no consent fields needed, existing `displayName` is preserved.
- **First-time user** (no local profile) → GDPR consent is mandatory before any local row is created. If `consentedTypes` (must include `account_creation`) **and** `policyVersion` are absent → **`422 { error: "consent_required" }`**, and the Supabase auth user the exchange just created is **deleted** (no orphan identity); the client then re-submits the same token **with** consent. The cleanup **fails closed**: if the auth-user delete itself fails, the route returns **`500`** instead of `422`, so a `422` never falsely implies an unconsented identity was removed. When consent is present, the handler creates the user, `consent_records`, default `notification_preferences`, and `audit_log: user.registered` **atomically** — and if that DB tx fails, the Supabase auth user is **rolled back** (deleted), exactly like email/password signup (a failed rollback is logged as a possible orphan).
- **Soft-deleted account** → same as login: generic `401`, the issued Supabase session is **revoked** (global sign-out), and `audit_log: user.login_failed` is written with the actor id. The auth identity is **not** hard-deleted (it's a real, soft-deleted account).
- An **invalid/forged/expired token** → generic `401` + `audit_log: user.login_failed`.
- **Infra:** requires the **Google provider enabled in Supabase** (prod + test) with the Google OAuth client IDs — a one-time dashboard step (see `docs/STATUS.md`).

**Password reset is enumeration-resistant and uses hashed, single-use, expiring tokens:**

- `forgot-password` → **uniform `202`** for any email; only a real, **non-deleted** account gets a reset email + token. The DB (`password_reset_tokens`) stores only a **SHA-256 hash** of the token (never the raw token), with a **30-minute expiry**. Issuing a new token **invalidates any prior outstanding token** (at most one active per user). Writes `audit_log: user.password_reset_requested`.
- `reset-password` → **atomically consumes** the token — a single `UPDATE ... SET used_at = now() WHERE token_hash = … AND used_at IS NULL AND expires_at > now() AND <user is live> RETURNING …` — then sets the new password via Supabase admin and writes `audit_log: user.password_reset`. The atomic consume closes the **double-use race** (two parallel requests → only one wins) and prevents resetting a **soft-deleted** account (token issued before deletion can't reset it). **One generic `400`** for invalid / expired / already-used / deleted-user tokens. IP-rate-limited to deter token brute force.

Logout is client-side (discard tokens); an optional `POST /auth/logout` to revoke the refresh token may be added later.

---

## 5. Account & GDPR — `/api/v1/account` 🔑

These are part of the **locked contract** (COMPLIANCE §5.2/§5.5) — not optional, and gates for onboarding real users.

(Paths absolute here, since the collection root itself is an endpoint.)

| Method | Path                                | Rate                 | Body                               | Success               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------- | -------------------- | ---------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/account/export`            | `exportUser`         | —                                  | `200 AccountExport`   | Art. 20 portability. Complete JSON of the caller's non-secret data: profile + createdAt, communities joined (+ when), posts, messages, events RSVP'd, consent records, **notification preferences, blocks, reports submitted, subscription state**. **Soft-deleted posts/messages are included as-is** (flagged `deleted: true`, content e.g. `[deleted]`). **Excluded by design** (security/ops artifacts, not portable personal data): raw **push tokens**, **password-reset token hashes**, Supabase **auth internals**, and the **`audit_log`**. Scoped to `req.user` (own data only); audited `user.data_exported`; the export body is never logged. |
| DELETE | `/api/v1/account`                   | `eraseUser`          | —                                  | `200 { ok: true }`    | Art. 17 erasure (transactional anonymisation cascade). **Generic response — leaks no internal detail.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/api/v1/account/change-password`   | `changePasswordUser` | `{ currentPassword, newPassword }` | `200 { ok: true }`    | Verifies the current password (generic `401` if wrong), updates it, then **revokes the user's refresh sessions** (incl. the verification session) — a password change requires **re-login**. Locally-verified access JWTs stay valid until they expire (JWKS, no per-request revocation). Audits `user.password_changed` / `user.password_change_failed`.                                                                                                                                                                                                                                                                                                 |
| GET    | `/api/v1/account/consents`          | —                    | —                                  | `200 ConsentRecord[]` | Active + withdrawn consents, newest grant first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POST   | `/api/v1/account/consents/withdraw` | —                    | `{ consentType }`                  | `200 { ok: true }`    | Withdrawing `account_creation` triggers the deletion flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**`DELETE /account` behaviour (server, COMPLIANCE §5.2) — ordering is deliberate (DB-first):**

1. `req.user.id` (never a body `userId`); rate-limited (`eraseUser`); **capture the bearer access token** before erasing.
2. **One DB transaction — the anonymisation cascade** across every user-referencing table:
   - content scrubbed + marked deleted: `posts` → `content='[deleted]'`, `imageUrl=null`, `authorId=null`, `deletedAt=now`; `messages` → `content='[deleted]'`, `senderId=null`, `deletedAt=now`;
   - creator/reporter/reviewer FKs (`communities`, `events`, `safe_places`, `ad_campaigns`, `reports`) → **null** (rows survive, de-linked);
   - relational/consent/token rows (`community_memberships`, `event_rsvps`, `blocks`, `consent_records`, `device_push_tokens`, `notification_preferences`, `subscriptions`, `password_reset_tokens`) → **deleted**;
   - `audit_log`: existing rows' `actorId` → **null** (rows **retained**), then a `user.deleted` entry carrying **no user identifier** (`actorId`/`resourceId`/metadata all null);
   - the `users` row is **anonymised in place** (`email = deleted-<uuid>@deleted.invalid`, `displayName = '[deleted]'`, `avatarUrl`/`preferredCity` → null, `isPremium`/`isAdmin` → false, `deletedAt = now()`) — **not hard-deleted**, so the `deletedAt` blocking checks keep working.
3. **`invalidateProfileCache(userId)`** (a 60s-stale deleted identity is a security issue).
4. **Best-effort Supabase cleanup** (after the DB commit): global **sign-out** of the captured token + **delete the Supabase auth user**. Failures are logged (sanitized), not fatal — the PII is already erased and the anonymised row blocks login.
5. Return generic `200 { ok: true }`. The response reveals none of these steps. A **repeat** `DELETE` with the same token is rejected by `isAuthenticated` (the `deletedAt` row + invalidated cache → `401`) before reaching the handler — it does not double-process. (`storage.eraseUser` is itself safely re-runnable, but the route is not reached again.)

---

## 6. Profile & uploads — `/api/v1`

| Method | Path                  | Class | Body                               | Success                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | --------------------- | ----- | ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/profile`            | 🔑    | —                                  | `200 AccountProfile`     | The caller's own account (closes the prior "no `GET /me`" gap, P-1).                                                                                                                                                                                                                                                                                                                                           |
| PATCH  | `/profile`            | 🔑    | `{ displayName?, preferredCity? }` | `200 AccountProfile`     | Strict; **empty body → `400`** (must change something); fields trimmed. 🚧 `preferredCity` is city-level only — **no GPS** (COMPLIANCE §5.8); a **blank/whitespace `preferredCity` clears it to `null`** (removes the city). 🚧 **`avatarKey` deferred** until R2 is provisioned (currently rejected). Rate-limited (`accountUpdateUser`); writes invalidate the profile cache + audit `user.profile_updated`. |
| GET    | `/users/:id`          | 🔑    | —                                  | `200 PublicUser`         | **`displayName`/`avatarUrl` only — never email.**                                                                                                                                                                                                                                                                                                                                                              |
| POST   | `/uploads/:assetType` | 🔑    | `{ contentType }`                  | `200 { uploadUrl, key }` | `assetType ∈ {avatar, community, event, post}`. Returns a presigned R2 PUT URL + UUID `key`; client uploads directly, then sets `key` on the target resource (`avatarKey`/`imageKey`). Private buckets, signed URLs only.                                                                                                                                                                                      |

---

## 7. Communities — `/api/v1/communities`

| Method | Path                               | Class | Rate                  | Body/Query               | Success                                                 |
| ------ | ---------------------------------- | ----- | --------------------- | ------------------------ | ------------------------------------------------------- | ------ |
| GET    | `/communities`                     | 🔑    | —                     | offset/page + `?search=` | `200 OffsetPage<CommunityDTO>`                          |
| POST   | `/communities`                     | 🔑    | `communityCreateUser` | `CreateCommunityInput`   | `201 CommunityDTO` (creator becomes community admin)    |
| GET    | `/communities/:id`                 | 🔑    | —                     | —                        | `200 CommunityDTO` (+ `membership: { role }             | null`) |
| PATCH  | `/communities/:id`                 | 🔑    | —                     | `UpdateCommunityInput`   | `200 CommunityDTO` (community admin/mod only, else 403) |
| DELETE | `/communities/:id`                 | 🔑    | —                     | —                        | `200 { ok: true }` (community admin only; soft delete)  |
| POST   | `/communities/:id/join`            | 🔑    | `communityJoinUser`   | —                        | `200 { role: "member" }` (409 if already a member)      |
| DELETE | `/communities/:id/leave`           | 🔑    | —                     | —                        | `200 { ok: true }`                                      |
| GET    | `/communities/:id/members`         | 🔑    | —                     | offset/page              | `200 OffsetPage<{ user: PublicUser, role, joinedAt }>`  |
| PATCH  | `/communities/:id/members/:userId` | 🔑    | —                     | `{ role }`               | `200 { role }` (community admin only)                   |

**Implemented (Sprint-3 slice 1, `feat/communities`):** `POST /communities` (creator → admin, audited), `GET /communities` (offset + `?search=`, with `memberCount` + caller's `membership`), `GET /communities/:id`, `POST /:id/join` (idempotency-guarded; **`409`** if already a member; **`404`** for a missing/deleted community), `DELETE /:id/leave` (idempotent → `200`). Community creation + join/leave write `audit_log` (`community.created` / `community.member_joined` / `community.member_left`). **Not yet built** (later slices): `PATCH`/`DELETE /communities/:id`, `GET /:id/members`, member role management (`PATCH /:id/members/:userId`).

`role ∈ {member, moderator, admin}` (community-level — distinct from platform `isAdmin`). Triggering events fire pushes (`new_member_joined`, `community_invite`).

---

## 8. Posts — `/api/v1`

| Method | Path                     | Class | Rate                | Body/Query        | Success                                                                          |
| ------ | ------------------------ | ----- | ------------------- | ----------------- | -------------------------------------------------------------------------------- |
| GET    | `/communities/:id/posts` | 🔑    | —                   | **cursor**        | `200 CursorPage<PostDTO>`                                                        |
| POST   | `/communities/:id/posts` | 🔑    | `contentCreateUser` | `CreatePostInput` | `201 PostDTO` (fires `new_community_post`)                                       |
| GET    | `/posts/:id`             | 🔑    | —                   | —                 | `200 PostDTO`                                                                    |
| DELETE | `/posts/:id`             | 🔑    | —                   | —                 | `200 { ok: true }` (author or community mod; content → `[deleted]`, soft delete) |
| POST   | `/posts/:id/report`      | 🔑    | `reportUser`        | `{ reason }`      | `201 { ok: true }` (enqueues a `reports` row)                                    |

`PostDTO.author` is a `PublicUser`. Deleted posts return with `content: "[deleted]"` and `author: null`.

---

## 9. Community chat — `/api/v1/communities/:id/messages`

Hybrid: **HTTP for persistence + history, Supabase Realtime Broadcast for live delivery** (TRANSFER §3.9, COMPLIANCE §6).

| Method | Path                        | Class | Rate                | Body/Query                         | Success                                                           |
| ------ | --------------------------- | ----- | ------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| GET    | `/communities/:id/messages` | 🔑    | —                   | **cursor** (history, newest-first) | `200 CursorPage<MessageDTO>`                                      |
| POST   | `/communities/:id/messages` | 🔑    | `contentCreateUser` | `{ content }`                      | `201 MessageDTO`                                                  |
| DELETE | `/messages/:id`             | 🔑    | —                   | —                                  | `200 { ok: true }` (author or mod; content cleared → `[deleted]`) |
| POST   | `/messages/:id/report`      | 🔑    | `reportUser`        | `{ reason }`                       | `201 { ok: true }`                                                |

- `POST …/messages` persists to `messages` **then** broadcasts `new_message` on channel `chat:{communityId}`. History loads via `GET` only — Realtime carries new messages after screen open.
- **Realtime delivery is not an HTTP endpoint:** the client subscribes with `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Broadcast bypasses the DB — does not violate the anon-key rule). Connection lifecycle is mandatory (subscribe on active foreground chat screen only; unsubscribe on navigate-away/background).
- **Compliance:** messages are plaintext (moderation requirement, E2EE rejected, §5.6). **Never log message content** — on send failure log `{ userId, communityId, timestamp, errorCode }` only.

---

## 10. Events & RSVPs — `/api/v1`

| Method | Path                      | Class | Body/Query                                           | Success                                        |
| ------ | ------------------------- | ----- | ---------------------------------------------------- | ---------------------------------------------- |
| GET    | `/events`                 | 🔑    | **cursor** (ordered by `startsAt`) + `?communityId=` | `200 CursorPage<EventDTO>`                     |
| POST   | `/communities/:id/events` | 🔑    | `CreateEventInput`                                   | `201 EventDTO` (member/mod; fires `new_event`) |
| GET    | `/events/:id`             | 🔑    | —                                                    | `200 EventDTO`                                 |
| PATCH  | `/events/:id`             | 🔑    | `UpdateEventInput`                                   | `200 EventDTO` (creator/mod)                   |
| DELETE | `/events/:id`             | 🔑    | —                                                    | `200 { ok: true }` (creator/mod; soft delete)  |
| POST   | `/events/:id/rsvp`        | 🔑    | `{ status }`                                         | `200 { status }` (upsert)                      |
| DELETE | `/events/:id/rsvp`        | 🔑    | —                                                    | `200 { ok: true }`                             |
| GET    | `/events/:id/rsvps`       | 🔑    | offset/page                                          | `200 OffsetPage<{ user: PublicUser, status }>` |

`status ∈ {going, interested, not_going}`. `event_reminder` pushes are sent by the scheduled job, not an endpoint. Event `location` is free text (venue) — 🚧 no pin coordinates persisted in v1.

---

## 11. Safe places & resources — `/api/v1` (admin-curated, read-only for users)

| Method | Path                  | Class | Query                                         | Success                        | Notes                                                                                                                                                 |
| ------ | --------------------- | ----- | --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/safe-places`        | 🔑    | offset/page + `?category=&city=&near=lat,lng` | `200 OffsetPage<SafePlaceDTO>` | `near` coords are **ephemeral** — used for this query's distance sort then discarded; **not stored, not logged, not in analytics** (COMPLIANCE §5.8). |
| GET    | `/safe-places/:id`    | 🔑    | —                                             | `200 SafePlaceDTO`             | Venue coordinates are admin-curated venue data (allowed), not user location.                                                                          |
| GET    | `/resources`          | 🔑    | offset/page + `?category=`                    | `200 OffsetPage<ResourceDTO>`  | Support/education content.                                                                                                                            |
| GET    | `/resources/:id`      | 🔑    | —                                             | `200 ResourceDTO`              |                                                                                                                                                       |
| GET    | `/emergency-contacts` | 🌐    | —                                             | `200 EmergencyContact[]`       | Safety-critical — intentionally public so it works even signed-out.                                                                                   |

User writes to safe places are **admin-only** (§14). 🚧 whether `/safe-places` is `🔑` or `🌐` is provisional pending the DPIA's location-feature review — defaulting to `🔑`.

---

## 12. Reporting, blocking & notifications — `/api/v1`

| Method | Path                        | Class | Rate            | Body                                  | Success                                   |
| ------ | --------------------------- | ----- | --------------- | ------------------------------------- | ----------------------------------------- |
| POST   | `/reports`                  | 🔑    | `reportUser`    | `CreateReportInput`                   | `201 { ok: true }`                        |
| POST   | `/blocks`                   | 🔑    | —               | `{ blockedUserId }`                   | `201 { ok: true }`                        |
| DELETE | `/blocks/:userId`           | 🔑    | —               | —                                     | `200 { ok: true }`                        |
| GET    | `/blocks`                   | 🔑    | —               | —                                     | `200 PublicUser[]`                        |
| GET    | `/notification-preferences` | 🔑    | —               | —                                     | `200 NotificationPreferencesDTO`          |
| PATCH  | `/notification-preferences` | 🔑    | —               | `Partial<NotificationPreferencesDTO>` | `200 NotificationPreferencesDTO`          |
| POST   | `/push-tokens`              | 🔑    | `pushTokenUser` | `{ token, platform }`                 | `201 { ok: true }`                        |
| PATCH  | `/push-tokens`              | 🔑    | `pushTokenUser` | `{ token }`                           | `200 { ok: true }` (deactivate on logout) |

`CreateReportInput = { resourceType: post|message|user|event|community, resourceId, reason }`. Block/mute is enforced server-side in content queries (built from the start — TRANSFER §5.3). Notification-pref keys: `communityPosts, events, eventReminders, communityInvites, memberJoins` (matches `notification_preferences`; `moderation_action` is always-on with no toggle). `platform ∈ {ios, android, web}`.

---

## 13. Subscriptions & RevenueCat webhook

| Method | Path                          | Class | Rate                  | Notes                                                               |
| ------ | ----------------------------- | ----- | --------------------- | ------------------------------------------------------------------- |
| GET    | `/api/v1/subscription`        | 🔑    | —                     | `200 SubscriptionDTO` — current premium state for the caller.       |
| POST   | `/api/v1/webhooks/revenuecat` | 🪝    | `revenuecatWebhookIp` | RevenueCat event. **Webhook-authenticated, NOT `isAuthenticated`.** |

**RevenueCat webhook — signature verification is part of the contract (CLAUDE.md §4):**

1. The route reads the raw body via `req.rawBody` (Express's `verify` callback) — **not** `JSON.stringify(req.body)`.
2. Verify the `Authorization` header against `REVENUECAT_WEBHOOK_SECRET` over `req.rawBody`.
3. **On verification failure → immediately `400 { "error": "Invalid signature" }`, process nothing.**
4. On success → upsert `subscriptions` for the user, return `200`.
   There is no `req.user` on this route; the user is resolved from the RevenueCat app-user-id in the payload.

---

## 14. Admin dashboard — `/api/v1/admin/*` 🛡️

**Admin sign-in — `POST /api/admin/login` 🌐** (the one unauthenticated admin route — it _is_ the auth step). Body `{ email, password }` (strict). Authenticates via Supabase `signInWithPassword`, then **gates on a verified, live `isAdmin` profile server-side**. Every failure — bad credentials, unverified, missing/soft-deleted profile, or **non-admin** — returns the **same generic `401 { "error": "Invalid credentials" }`**, so the client can never learn who is an admin. If Supabase issued a session before the gate fails, it is **revoked** (global sign-out) so a non-admin never holds one. Success → `200 SessionResponse` (admin's `AccountProfile` + tokens). Audited: `admin.login` on success, `admin.login_failed` on every failure (with actor id when known). Dual-bucket rate-limited (`adminLoginIp` + `adminLoginEmail`). The dashboard stores only the access token (`localStorage` — **AR-1**).

All other admin routes are `isAuthenticated` **then** `requireAdmin` (403 for non-admins). All list endpoints use **offset/page**. All mutations write `audit_log`. (`GET /api/v1/admin/me` is the scaffolded `/api/admin/me`, to migrate.)

| Domain       | Endpoints                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Self         | `GET /admin/me` → `{ id, displayName, isAdmin }`                                                                             |
| Users        | `GET /admin/users` (offset, `?search=&status=`), `GET /admin/users/:id`, `PATCH /admin/users/:id` (ban/unban, set `isAdmin`) |
| Communities  | `GET/POST /admin/communities`, `GET/PATCH/DELETE /admin/communities/:id`                                                     |
| Events       | `GET/POST /admin/events`, `GET/PATCH/DELETE /admin/events/:id`                                                               |
| Safe places  | `GET/POST /admin/safe-places`, `GET/PATCH/DELETE /admin/safe-places/:id` (the only write path for venues)                    |
| Reports      | `GET /admin/reports` (offset, `?status=`), `PATCH /admin/reports/:id` (resolve/dismiss + `resolution`)                       |
| Moderation   | `POST /admin/moderation/ban`, `/mute`, `/remove-content` (each writes `audit_log: moderation.*`)                             |
| Ad campaigns | `GET/POST /admin/ad-campaigns`, `GET/PATCH/DELETE /admin/ad-campaigns/:id`                                                   |

---

## 15. Ads — `/api/v1/ads` 🔑

| Method | Path   | Success       | Notes                                                                                                             |
| ------ | ------ | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/ads` | `200 AdDTO[]` | Returns active campaigns. **Empty array for premium users** (no ads with premium). Admin management is under §14. |

---

## 16. Open items / provisional

- 🚧 **DPIA-dependent:** `preferredCity` and any age/DOB field (none in v1 yet), `/safe-places` auth class, event pin coordinates. Lock after the DPIA.
- **Scaffold path migration (tracked, not churned now):** `/api/admin/me` → `/api/v1/admin/me`; `/api/push-tokens` → `/api/v1/push-tokens`.
- **Realtime channels** (`chat:{communityId}`) are documented here but are not HTTP endpoints — see §9.
- **Deferred:** direct messages (no endpoints) until scoped.

_Living contract — update by PR at each sprint boundary as endpoints are implemented. Mark each endpoint Implemented / In-progress as it lands._
