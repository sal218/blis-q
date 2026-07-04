# Compliance & Privacy Reference — Blisko

> **Who this file is for:** Ladly Media FZ-LLC (the development team building Blisko), Claude Code working in this repository, and the client (the data controller). It defines the legal context, technical obligations, responsibility split, and concrete engineering requirements for GDPR compliance on Blisko.
>
> **Parties:** The **client** is the **data controller** — they operate Blisko, own the product, and determine what data is collected and why. **Ladly Media FZ-LLC — the development team (contractors) — is the data processor**, building and operating the system on the client's instructions.
>
> This file should be consulted before designing any feature that touches user data — schema design, API endpoints, auth flows, messaging, profiles, or analytics.

---

## 1. Why This App Has Elevated Compliance Requirements

Blisko is a community platform explicitly serving Poland's LGBT+ community. Under GDPR, **sexual orientation is Article 9 special category data** — the highest protection tier in EU data protection law.

The classification is important: it is not derived from what users _say_ in the app. The mere fact that someone creates an account on Blisko implies their sexual orientation or gender identity. The client (the data controller) is processing Article 9 data from the moment the first user registers. This is not a future concern — it applies from day one.

Additionally:

- Blisko collects location data (safe place discovery feature)
- Blisko serves a population that is a **vulnerable group** in Poland's current political context
- Blisko may store private messages between users
- Blisko targets scale (50K+ users), placing it firmly in "large-scale processing"

These factors together mean several GDPR obligations that are optional for ordinary apps are **mandatory** for Blisko.

---

## 2. Article 9 — Special Category Data

**What it is:**

GDPR Article 9(1) prohibits processing of special categories of personal data. Article 9(2) lists the exceptions under which processing is lawful. The full list of special categories:

- Racial or ethnic origin
- Political opinions
- Religious or philosophical beliefs
- Trade union membership
- Genetic data
- Biometric data (for unique identification)
- Health data
- **Sex life or sexual orientation** ← directly applicable to Blisko

**Why it applies to Blisko:**

Using Blisko constitutes data that reveals a person's sexual orientation or gender identity. The user doesn't need to explicitly state this — joining a platform described as "Poland's community platform for the LGBT+ community" is itself the signal. The data controller processes this data from the moment of account creation.

**Legal basis for processing:**

The only realistic legal basis for Blisko is **Article 9(2)(a): explicit consent**. This means:

- Consent must be freely given, specific, informed, and unambiguous
- Consent must be given through a clear affirmative action — not pre-ticked boxes, not "by using this app you agree"
- Users must be able to withdraw consent as easily as they gave it
- Consent must be documented per user, per purpose, per version of the privacy policy

---

## 3. Responsibility Split — Developer vs. Client

### The client is the data controller. Ladly Media FZ-LLC (the development team) is the data processor.

This is a legal classification under GDPR Article 4. It is not a preference or a negotiation point.

- **Data controller** = the entity that determines the purposes and means of processing. That is **the client** — they operate Blisko, define what data is collected and why, and bear the primary legal obligations.
- **Data processor** = the entity that processes data on behalf of the controller. That is **Ladly Media FZ-LLC (the development team)** — it builds the system but acts on the client's instructions.

**Before any user data is handled, a Data Processing Agreement (DPA) must be signed between Ladly Media FZ-LLC (the processor) and the client (the controller).** This is a legal requirement under GDPR Article 28. It protects both parties and specifies what data is processed, for what purpose, and what security measures are in place.

**International transfer note:** Ladly Media FZ-LLC is established **outside the EU/EEA** (Middle East). The controller→processor data flow is therefore an international transfer, and the DPA must include an appropriate **transfer mechanism (e.g. Standard Contractual Clauses)**. This is a controller/legal-counsel decision; flagged here so it is not overlooked.

---

### Client (data controller) responsibilities — legal/operational

These are the client's obligations as data controller. Ladly Media FZ-LLC (the development team) does not perform these tasks but must confirm they are being addressed before launch.

| Obligation                                                           | Status needed before launch           |
| -------------------------------------------------------------------- | ------------------------------------- |
| Privacy policy drafted and legally reviewed                          | Required                              |
| Cookie/consent notice (web)                                          | Required                              |
| Legal basis documented for each processing activity                  | Required                              |
| Data Processing Agreement signed with the development team           | Required before dev handles user data |
| DPIA conducted and documented                                        | Required (see Section 4)              |
| UODO registration / assessment of DPO requirement                    | Required                              |
| DPO appointed (likely required at scale with Article 9 data)         | Evaluate in Phase 1                   |
| Incident response process defined (who calls UODO within 72hr)       | Required before launch                |
| Data subject request handling process (erasure, access, portability) | Required before launch                |

---

### Developer responsibilities (technical)

The development team builds the systems that make the client's compliance obligations technically enforceable. If these are not built, the client cannot comply — even with the best legal framework.

| Requirement                     | Implementation                                 |
| ------------------------------- | ---------------------------------------------- |
| Consent collection mechanism    | UI + backend that meets GDPR standards         |
| Consent records storage         | `consent_records` table (see Section 5)        |
| Right to erasure implementation | Deletion/anonymisation cascade (see Section 5) |
| Audit logging                   | `audit_log` table for significant actions      |
| Data retention enforcement      | Scheduled cleanup jobs                         |
| Data export (portability)       | User data export endpoint                      |
| Breach detection capability     | Sentry, log drains, monitoring alerts          |
| Encryption posture              | Decisions documented and implemented           |
| Schema designed for deletion    | Every table has defined ON DELETE behaviour    |

---

## 4. DPIA — What It Is and What It Means for the Build

### What a DPIA is

A Data Protection Impact Assessment (DPIA) is a documented risk assessment required by GDPR Article 35 before processing that is "likely to result in a high risk to the rights and freedoms of natural persons." It is not optional when the criteria are met.

The DPIA asks: what data is collected, why, what risks exist, and what mitigations are in place. The output is a written document the data controller can present to a regulator if challenged.

### Why it is mandatory for Blisko

The EDPB guidance states a DPIA is required when processing meets two or more of nine criteria. Blisko meets at minimum four:

1. **Special category data (Article 9)** — sexual orientation, directly applicable
2. **Large-scale processing** — 50K+ users is the threshold regulators consider large scale
3. **Vulnerable persons** — LGBT+ individuals in Poland are a legally and socially vulnerable population in the current political climate
4. **Location data** — safe place discovery feature involves processing location

A DPIA is legally mandatory for Blisko. It must be completed before the app launches.

### The feedback loop for the build

The DPIA is the client's legal obligation. However, the DPIA produces technical requirements that the development team must implement. The process is:

```
Client engages legal counsel / DPO
        ↓
DPIA conducted during Phase 1 / Phase 2
        ↓
DPIA identifies specific risks and required mitigations
        ↓
Mitigations become technical requirements → fed into Phase 2 architecture
        ↓
Development team implements mitigations in schema, API, and security model
        ↓
DPIA documentation records what was built and when
```

**The schema must not be finalised until the DPIA outputs are known.** If the DPIA determines certain data should not be collected at all, or that DMs require application-level encryption, those decisions must be reflected in the data model. Retrofitting them is expensive.

---

## 5. Technical Requirements — What Must Be Built

### 5.1 Consent Records Table

Every user must give explicit, informed consent before account creation. That consent must be recorded in a way that can be audited and proven.

```sql
CREATE TABLE consent_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type   text        NOT NULL,
  -- Values: 'account_creation', 'marketing_emails', 'analytics', 'location_data'
  policy_version text        NOT NULL,
  -- The version of the privacy policy the user consented to, e.g. '2026-08-20'
  -- When the privacy policy is updated, users must re-consent for the new version
  granted_at     timestamptz NOT NULL DEFAULT now(),
  withdrawn_at   timestamptz,
  -- null = consent is still active; populated when user withdraws consent
  ip_address     inet,
  -- Stored for audit purposes. Apply retention policy — purge after 90 days.
  user_agent     text
);

CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_records_type_version ON consent_records(consent_type, policy_version);
```

**Enforcement rules:**

- A user cannot complete registration without a `consent_records` row being created
- When the privacy policy version changes, users whose `consent_records.policy_version` pre-dates the new version must be prompted to re-consent on next login
- Withdrawing consent (`withdrawn_at` populated) for `account_creation` triggers the account deletion flow

---

### 5.2 User Deletion — Erasure Procedure

The right to erasure (Article 17) requires that personal data can be fully removed. This must be designed into the schema before any tables are created — retrofitting deletion logic is extremely costly.

**Design decision (document and get client sign-off in Phase 2):**

Option A — Hard delete: remove the user row and cascade-delete all their data. Simple, but destroys community contributions.

Option B — Anonymisation: clear all PII fields, retain anonymised content. Better for community health. This is the recommended approach for Blisko.

**Anonymisation means, for each table:**

| Table                   | Fields to clear                                          | Fields to retain                                |
| ----------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `users`                 | email, display_name, avatar_url, location, date_of_birth | id (for referential integrity), created_at      |
| `messages`              | Replace content with `[deleted]`, clear sender details   | Timestamps, community_id (for thread integrity) |
| `community_memberships` | Delete the row                                           | —                                               |
| `event_rsvps`           | Delete the row                                           | —                                               |
| `posts`                 | Replace content with `[deleted]`, clear author details   | Timestamps, community_id                        |
| `reports`               | Keep for moderation audit, anonymise reporter            | Report content, resolution                      |
| `consent_records`       | Delete all rows                                          | — (deletion itself is the record)               |
| `device_push_tokens`    | Delete all rows                                          | —                                               |
| `audit_log`             | Keep for security, anonymise user reference              | Action, timestamps                              |

**Every table that stores user-linked data must have its ON DELETE behaviour explicitly defined in the migration.** No implicit defaults. No undocumented behaviour.

**The deletion endpoint** (`DELETE /api/account`) must:

1. Verify the requesting user owns the account (not `req.body.userId` — use `req.user.id` from `isAuthenticated`)
2. Revoke all active Supabase auth sessions for that user
3. Deactivate all push tokens
4. Execute the anonymisation cascade in a single transaction
5. Call `invalidateProfileCache(userId)` to immediately clear the auth cache for this user
6. Write an entry to `audit_log` recording the deletion (user ID anonymised, action recorded)
7. Return 200 — do not reveal the internal deletion steps in the response

---

### 5.3 Audit Log Table

Required for breach investigation, regulatory response, and moderation accountability.

```sql
CREATE TABLE audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid,
  -- The user who performed the action. null for system-initiated actions.
  -- Anonymise (set to null) when the actor's account is deleted, but retain the log entry.
  action        text        NOT NULL,
  -- Use dot-notation: 'user.registered', 'user.deleted', 'user.login_failed',
  -- 'message.reported', 'community.created', 'moderation.user_banned', etc.
  resource_type text,
  resource_id   uuid,
  metadata      jsonb,
  -- Additional context. Never include PII, message content, or passwords.
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
```

**What to log:**

- User registration, login success, login failure
- Password reset requests and completions
- Account deletion
- Community creation, deletion, membership changes
- Content reports submitted
- Moderation actions (ban, mute, content removal)
- Admin actions

**What NOT to log:**

- Message content
- Passwords or tokens (ever)
- Full request bodies
- Personal communications

**Retention:** Standard entries: 90 days. Security-relevant entries (login failures, moderation actions): 12 months. Implement a scheduled cleanup job. Log retention periods must be documented in the privacy policy.

---

### 5.4 Data Retention — Scheduled Cleanup

GDPR requires data is not retained longer than necessary. This is enforced through automated jobs, not manual processes.

Implement a scheduled job (Fly.io cron or Supabase Edge Function on schedule) that runs daily and:

1. **Purges expired soft-deleted content:** Anything with `deleted_at < now() - interval '30 days'` is hard-deleted
2. **Purges old audit logs:** Entries beyond the retention window are deleted
3. **Flags inactive accounts:** Users who haven't logged in for the defined inactivity period receive a notification warning of scheduled deletion
4. **Purges inactive accounts:** After a further grace period following the warning, accounts are anonymised

The inactivity period threshold must be defined with the client (common values: 12–24 months) and documented in the privacy policy.

---

### 5.5 Data Export Endpoint (Article 20 — Portability)

Users have the right to receive their personal data in a portable format. Build this endpoint before launch.

`GET /api/account/export`

Response: a JSON payload containing everything linked to the authenticated user's account:

- Profile data
- List of communities joined and when
- Posts and messages authored (content + timestamps)
- Events attended
- Consent records
- Account creation date

This can be triggered by the user (self-serve) or by the client in response to a formal data subject request. At launch, admin-triggered is sufficient. Self-serve can be added later.

---

### 5.6 Encryption Posture

**What is already handled (no action required):**

- Data at rest: Supabase (AWS) encrypts with AES-256. R2 (Cloudflare) encrypts at rest. Both are handled by the providers.
- Data in transit: TLS between all services. Fly.io terminates TLS. All API calls use HTTPS. Enforced at infrastructure level.

**Decision — made and documented:**

**Encryption approach: infrastructure-level only. No application-level encryption (E2EE).**

This decision applies to both community group chat and any future private direct messages.

**Rationale:**

E2EE was explicitly evaluated and rejected for the following reason: **it fundamentally breaks content moderation**. Blisko serves a vulnerable community in a hostile political environment. The ability for moderators to review reported content, remove harmful messages, and act on reports is a safety-critical feature — not a nice-to-have. E2EE stores ciphertext the server cannot read. If a user reports a message, the moderation system has nothing to act on. There is no viable compromise between true E2EE and effective moderation.

The correct model for Blisko is the **Discord model**: messages are stored in plaintext in PostgreSQL (encrypted at rest by the infrastructure provider). The development team and client (with database access) can technically read message content. This is disclosed in the privacy policy. Moderation tooling works because content is readable server-side.

**What this means for the privacy policy (client's responsibility):**
The privacy policy must clearly disclose that:

- Messages are stored on Blisko's servers
- Message content may be reviewed by moderators in response to reports
- The development team (as data processor) has technical access to database content
- Message content is encrypted at rest using AES-256 by the infrastructure provider

**This decision is final. Do not reopen E2EE discussion without also resolving how reported content would be reviewed by moderators.**

---

### 5.7 Breach Notification Readiness

GDPR requires notification to the supervisory authority (UODO) within 72 hours of a breach discovery. This requires both process and technical tooling.

**Technical requirements:**

- **Sentry** — application error monitoring with alerts to the team. Catch anomalous error spikes that could indicate a breach or attack.
- **Fly.io log drains** — export application logs to persistent storage (e.g. Logtail, Papertrail). You cannot investigate a breach if logs were not retained.
- **Supabase audit logs** — enabled on Pro tier. Tracks auth events (login, password reset, token usage) at the Supabase layer.
- **Upstash rate limit monitoring** — anomalous spikes in rate limit hits may indicate credential stuffing or enumeration attacks.

**Process requirement (client's responsibility):**
A documented incident response plan that answers: who is notified first, who contacts UODO, what information is gathered, what constitutes a notifiable breach vs. a non-notifiable incident. This plan must exist before launch.

---

### 5.8 Safe Places / Location Data — Engineering Rules

The safe place discovery feature (find LGBT-friendly cafés, clubs, NGOs, support services on a map) involves location data. Location data is one of the four DPIA triggers for Blisko (see Section 4). These engineering rules are non-negotiable.

**Data minimisation for location:**

- Location must be requested at the **point of use** — when the user explicitly opens the map or safe places feature. Never request location at app launch or in the background.
- GPS coordinates must **not be persisted to the database** unless the user explicitly saves a "home area" preference.
- Search queries ("find places near me") should be executed with ephemeral coordinates — coordinates are used for a single query and discarded. They are not stored in the database, not written to logs, and not included in analytics events.
- If storing a user's preferred region, store at **city-level granularity only** (e.g., "Warsaw") — never store precise GPS coordinates as a user preference.

**Safe places data (venues, NGOs, services):**

- The `safe_places` table stores curated venue data (name, address, category, coordinates). This is not user-generated per-row — it is admin/editor-curated.
- User interaction with safe places (views, saves, check-ins) may be collected only with explicit consent and must be deletable as part of the account erasure procedure.
- **OSM import is a candidate pool, not a safe list (SP-2, non-negotiable):** the admin "Import from OpenStreetMap" tool returns **generic venue types** (cafe/bar/etc.) — OSM does **not** verify a place is LGBT-safe. A human curator (client + team) **must vet every imported venue** and delete unfit ones; nothing user-facing may be auto-published. For a vulnerable audience, a wrongly-"safe" place is a safety risk — the human vetting is the safeguard, not the import. Only a **city + category** is sent to Overpass (no user PII); the raw response is never logged.
- **In-app framing:** present these as "LGBT-friendly places our team curates" (with appropriate care), **not an absolute safety guarantee**. The client (controller) owns the vetting standard and the framing/liability decision.
- **OpenStreetMap attribution (ODbL):** OSM data is free but its licence **requires attribution** — display "© OpenStreetMap contributors" wherever OSM-sourced venue/map data is shown (the mobile list + map). Free, but mandatory.

**Map library:**

- Choose a map provider with GDPR-compliant data processing terms. Google Maps sends usage data to Google — if used, document this in the privacy policy and ensure a DPA is in place with Google. An alternative is Mapbox (has EU data processing options) or OpenStreetMap-based (no user data sharing by default).
- Tile requests to map providers do not contain user identity, but do contain IP addresses. Document the map provider's data processing in the privacy policy.

**Location data and the DPIA:**
The DPIA must specifically address location data processing. Do not finalise the safe places feature implementation until the DPIA covers this use case.

---

## 6. Chat and Realtime — Architecture and Privacy Considerations

Blisko's community group chat introduces specific privacy requirements beyond standard messaging.

### Architecture decision (recorded here for DPIA documentation)

**Chosen approach: Supabase Realtime Broadcast + PostgreSQL hybrid.**

- **Message delivery**: Supabase Realtime in Broadcast mode (not Postgres Changes). Messages are broadcast to all subscribers of a channel in real time. Broadcast does not write to the database — it is a pure pub/sub delivery layer.
- **Message persistence**: Messages are written to a `messages` table in PostgreSQL via a standard API call (`POST /api/communities/:id/messages`). This happens in parallel with the broadcast.
- **History load**: When a user opens a community screen, they fetch message history via HTTP (`GET /api/communities/:id/messages`). Realtime handles only new messages arriving after screen open.
- **Connection lifecycle**: The Realtime channel is subscribed only when the community chat screen is active and the app is in the foreground. The subscription is removed when the user navigates away or the app backgrounds. This is mandatory — not a performance optimisation. See `TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md` Section 3.9 for the full connection lifecycle code pattern.

**Why this approach:**

- PostgreSQL remains the source of truth for all message history (GDPR-friendly — deletion is straightforward)
- No proprietary message storage system that complicates erasure compliance
- Moderation works: messages are readable by the server (see Section 5.6 encryption decision)

### Privacy rules for chat

**Do not log message content in application logs.** If a message send fails, log the failure (user ID, community ID, timestamp, error code). Never log the message body.

**Message deletion:** Users must be able to delete their own messages. Deleted messages should be replaced with `[message deleted]` in the message record — not hard-deleted, so thread context is preserved — but the content must be cleared immediately and irrecoverably.

**Right to erasure and messages:** When a user's account is deleted/anonymised, all their messages must have their content cleared and their sender identity anonymised. The message record can remain (for thread integrity) but it must be indistinguishable from any other anonymous `[deleted]` message.

**Moderation:** Reported messages must be reviewed before deletion decisions are made. The moderation queue must log who reviewed a report and what action was taken, for accountability. Moderation is possible because messages are stored in plaintext (see Section 5.6 — E2EE was rejected specifically to preserve this capability).

---

## 7. Checklist — Before Any User Data Enters the System

Use this before launch and before any beta testing begins.

### Client must have completed:

- [ ] DPA signed between Ladly Media FZ-LLC (the development team / processor) and the client (the controller)
- [ ] Privacy policy reviewed by legal counsel and accessible in the app
- [ ] Explicit consent UI reviewed and approved
- [ ] DPIA conducted and documented (covers Article 9 data, location data, vulnerable persons, large-scale processing)
- [ ] UODO obligations assessed
- [ ] Incident response plan documented
- [ ] Data subject request handling process established
- [ ] Map provider DPA in place (Google Maps / Mapbox / other — see Section 5.8)

### Development team must have built:

- [ ] `consent_records` table in schema
- [ ] Consent collection on registration (cannot skip or pre-tick)
- [ ] `audit_log` table in schema with defined retention
- [ ] User deletion / anonymisation endpoint (`DELETE /api/account`) with `invalidateProfileCache` call
- [ ] Deletion cascade tested — every table verified to handle user deletion correctly
- [ ] Data export endpoint (`GET /api/account/export`)
- [ ] Scheduled cleanup job (soft-delete purge, audit log purge, inactivity warnings)
- [ ] Sentry configured and alerting
- [ ] Fly.io log drains configured with persistent retention
- [ ] Supabase audit logs enabled
- [ ] Encryption posture decision documented and implemented
- [ ] All ON DELETE behaviours explicitly defined in every migration
- [ ] Location data: ephemeral-only queries, no GPS coordinate persistence, city-level preference only
- [ ] Safe places map provider DPA documented in codebase comments

---

## 8. Key Contacts and Authorities

| Entity                                | Role                             | Notes                                                                                                                                                                                           |
| ------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UODO (Urząd Ochrony Danych Osobowych) | Polish supervisory authority     | Must be notified of breaches within 72 hours. May need registration.                                                                                                                            |
| EDPB (European Data Protection Board) | EU-level guidance body           | Publishes guidance on Article 9, DPIAs, special category data processing                                                                                                                        |
| Supabase DPA                          | Available from Supabase support  | Required — document receipt                                                                                                                                                                     |
| Cloudflare DPA                        | Available at cloudflare.com/gdpr | Required for R2 usage                                                                                                                                                                           |
| Upstash DPA                           | Available from Upstash support   | Required for Redis usage                                                                                                                                                                        |
| Fly.io DPA                            | Available at fly.io/legal        | Required for API server hosting                                                                                                                                                                 |
| OpenStreetMap / Overpass              | Admin-only venue lookup (SP-2)   | Sub-processor for admin "Import from OSM": only a **city + category** leaves us (venue data, **no user PII**); server-side, raw response never logged. Confirm terms/attribution before launch. |

---

_Last updated: June 2026 (corrected the controller/processor roles — the **client** is the data controller; **Ladly Media FZ-LLC / the development team** is the data processor). Review this document when: adding new data collection features, changing data retention policies, changing the legal basis for processing, when the privacy policy is updated, or when new map/location services are integrated._
