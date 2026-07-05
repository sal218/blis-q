# Blis-Q — v1 Delivery Roadmap

> **Goal:** ship the complete Blis-Q v1 (iOS + Android + admin dashboard) in **6 months**.
> **Team:** Pretty Good Company — 2 developers (Sal + Adly) + AI assistance.
> **Structure:** 12 two-week sprints + a parallel "Week 0" setup track that starts immediately.
> **How to use:** open the current sprint, work top-to-bottom. Every item is tagged with an owner and any blocker. If a 🔒 external blocker isn't cleared, do the unblocked work in that sprint and escalate the blocker.

---

## Timeline

**Confirmed: ~6-month build.** Kickoff ~2026-06-09, **launch ~early December 2026** (12 two-week sprints + a Week-0 setup track + store-review buffer). `CLAUDE.md` has been updated to match (the earlier August date is retired). This is **aggressive for two developers** even with AI — protect the critical path and use the [scope-cut plan](#scope-risk--what-to-cut-if-behind) if a sprint slips.

---

## Legend

| Tag       | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| 👨‍💻 PGC    | Pretty Good Company (the developers / data processor) does it                 |
| 🏢 Client | The client (data controller) does it — PGC cannot do these                    |
| 🔒        | External blocker — depends on a third party / lead time outside our control   |
| ⛔        | Hard gate — downstream work cannot start until this is done                   |
| 🧪        | Ships with an integration test on the same branch (ENGINEERING_STANDARDS §11) |

**Owner reality:** legal, store-account ownership, and the DPIA are **client obligations** — PGC builds the systems but cannot sign the DPA, author the privacy policy, or enrol the Apple account on the client's behalf. Chase these early; they have multi-day-to-multi-week lead times.

---

## Cross-cutting rules (every sprint)

- **Tests live with code.** Every backend route ships with a `*.integration.test.ts` on the same branch (CLAUDE.md "Testing Rules"). Run `npm run test:integration` before calling anything done.
- **Manual device testing every sprint** on a real iOS **and** a real Android device — not just simulators (RN platform fixes in TRANSFER §3.7).
- **Never commit to `main`.** Branch per task (`feat/…`, `fix/…`), PR, green CI, merge.
- **Security rules are non-negotiable** (CLAUDE.md §1–10): backend-only data access, RLS zero-policy, Zod on every mutation, dual-bucket auth rate limits, `invalidateProfileCache` after every `users` write, `req.rawBody` for webhooks, fail-closed Redis.
- **Compliance-by-construction:** every new user-data table/route is checked against `COMPLIANCE_AND_PRIVACY.md` before it's written. No GPS persistence; city-level only.
- **Polish copy** for everything user-facing; English for code/comments/logs.
- **Two-dev split (guideline):** Dev A = backend/infra lead, Dev B = mobile lead, admin dashboard shared. AI accelerates all three. Adjust per sprint.

---

## Pitch-deck pillar coverage (keep this honest)

The client's pitch deck defines **4 feature pillars**. This maps each to where it lives in the plan + its tracker ID, so the roadmap can't silently drop deck scope again. Reconciled 2026-07-05 (originally the 2026-06-27 deck review filed these as P-items but didn't schedule them).

| Deck pillar                       | Deck promises                                                                                                           | Where in the plan                                                              | Status                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **1. Community & Networking**     | Profiles, thematic groups & local communities, group chats, topic rooms, networking across Poland                       | Communities S3 · chat S5 · **profile/networking depth → S7 (P-33)**            | Communities ✅ · chat ✅ · profiles **minimal** (P-33 open)             |
| **2. Events & Safe Places**       | LGBT event calendar & party listings **with map**; LGBT-friendly cafés/clubs/NGOs near you                              | Events S6 · Safe Places S7 (**P-40 epic**)                                     | Events ✅ · safe places mostly ✅ (**map SP-4**, submissions SP-5 open) |
| **3. Support & Education**        | Contacts to **psychologists/orgs/hotlines**, LGBT **rights guide**, **coming-out** support, **mental-health** resources | **S7 (P-37)**                                                                  | **Open** — was under-scoped as "resources"; now expanded                |
| **4. Safety, News & Initiatives** | Anonymity, reporting & moderation; **LGBT news** (PL+EU); **anonymous surveys, statistics, volunteering**               | Reporting/moderation S3–S4 ✅ · **News S7 (P-31)** · **Initiatives S7 (P-32)** | Moderation ✅ · **News + Initiatives open** (may fast-follow)           |

**Also deck-specified, tracked separately:** seasonal **Pride theme + Pride app icon** (June, per-user opt-in — 🔒 safety tension with "discreet by design", **P-30**); revenue — install fee (**P-34**), premium entitlements (**P-35**, S8), curated ads (**P-36**, S9). Quick-exit safety UI is **paused pending a client decision** (**P-17**), a deviation from the deck's "never-cut" safety gate — reconcile before launch.

---

## Week 0 — START IMMEDIATELY (parallel with Sprint 1)

These have lead times and **block** later work. Kick all of them off in the first days.

### Developer accounts — 🏢 Client (start day 1; some take days)

- ⛔🔒 **Apple Developer Program** — $99/yr, enrolment + identity verification can take **several days to 2 weeks**. Blocks TestFlight, App Store. **Start now.**
- 🔒 **Google Play Developer** — $25 one-time, ~1–2 days. Blocks Play testing/submission.
- **App Store Connect** app record + **Play Console** app record (after accounts exist).
- _Why client:_ store accounts and their banking/tax agreements belong to the business entity that publishes the app.

### Infrastructure provisioning — 👨‍💻 PGC (Sprint 0–1)

All EU-region, **regions are irreversible at creation** (TRANSFER §3.1):

- ⛔ **Supabase** project — **Frankfurt (eu-central-1)**. Configure GoTrue auth (email/password + Google). Apply `supabase/rls.sql`. `npm run db:push`.
- ⛔ **Separate Supabase TEST project** + set `BLISQ_TEST_DATABASE_URL` / `BLISQ_TEST_SUPABASE_URL` / `BLISQ_TEST_SUPABASE_SERVICE_ROLE_KEY` as GitHub secrets → flips the gated integration CI job live.
- ⛔ **Upstash Redis** — **Frankfurt** (default is US East — **select EU manually**).
- ⛔ **Cloudflare R2** — **EU jurisdiction**, 4 buckets (`blis-q-avatars`, `blis-q-community-images`, `blis-q-event-images`, `blis-q-post-images`). Jurisdiction is irreversible.
- ⛔ **Fly.io** app — **Warsaw (waw)**. Set secrets (`fly secrets set …`). First deploy of the health-check server.
- **Firebase** project — FCM + Google Sign-In (iOS + Android OAuth clients).
- 🔒 **Resend** account + **verify a custom sender domain** (DNS records, propagation can take hours–days). Blocks all real email.
- **Sentry** — EU data region.

### Legal / compliance kickoff — 🏢 Client (start day 1; long lead times)

- ⛔🔒 **DPA** signed between the client (controller) and PGC (processor) — GDPR Art. 28. **Required before PGC handles any real user data.** Sign before beta.
- ⛔🔒 **DPIA** with a lawyer — Art. 35 (Article 9 data, large-scale, vulnerable persons, location). **Schema must not be finalised until DPIA outputs are known** (COMPLIANCE §4). Target completion by end of Sprint 2.
- 🔒 Engage counsel for **Privacy Policy** + **Terms of Service** (Polish) — must be **live at a URL before App Store submission and before any real users**.
- **Age-verification approach** decision (do we collect DOB? COMPLIANCE-sensitive) — confirm with lawyer; feeds schema.
- **Map provider DPA** (Mapbox / OSM preferred; Google needs a DPA) for safe places.

### Design kickoff — 👨‍💻 PGC + designer

- Brand kit (indigo/violet, minimal), **app icon** (iOS/Android/notification), Figma **component library**.
- Begin rolling **screen mockups** (auth + onboarding first) — mockups must lead screen build by ~1 sprint.

---

## Sprint 1 — Foundations live + Auth backend (≈ Jun 9–20)

**Goal:** all infra green; a user can be created with consent recorded.

- **Backend (👨‍💻):**
  - 🧪 Auth routes: `POST /api/auth/signup` (creates user **+ `consent_records` row** — consent cannot be skipped/pre-ticked, COMPLIANCE §5.1), `POST /api/auth/login`, Google Sign-In verify (Firebase → Supabase session), `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
  - Wire dual-bucket rate limiters (`checkLoginRateLimit`, `checkSignupRateLimit`, `checkGoogleAuthRateLimit`, `checkPasswordResetRateLimit`) + `audit_log` for `user.registered` / `user.login_failed` / password resets.
  - Welcome + reset emails (Polish templates already scaffolded).
- **Mobile (👨‍💻):** navigation skeleton, theme/design-system wiring, auth screens (signup/login/forgot/reset) — build as mockups land.
- **Admin (👨‍💻):** replace the token-paste login with real Supabase admin sign-in; keep `requireAdmin` gate.
- **Infra/Legal/Design:** finish Week-0 infra; verify Fly deploy + `/api/health`; turn on integration CI (secrets). DPIA in progress (🏢🔒). Brand kit + icons done; component library + auth/onboarding mockups.
- **Dependencies / blockers:** Google Sign-In needs Firebase (Week 0). ⛔ Schema changes blocked on DPIA — work on the scaffold schema, avoid destructive migrations until DPIA locks it.

## Sprint 2 — Auth complete + Profiles + GDPR erasure/export (≈ Jun 23 – Jul 4)

**Goal:** the P-1/P-2 compliance blockers are closed; a user can fully manage and delete their account.

- **Backend (👨‍💻):**
  - 🧪 `GET/PATCH /api/profile` (displayName, avatar via R2 presigned upload + `confirmUpload`), `POST /api/account/change-password`.
  - 🧪 ⛔ **`DELETE /api/account`** — full transactional anonymisation cascade (COMPLIANCE §5.2): clear PII, content → `[deleted]`, drop memberships/RSVPs/tokens/consents, revoke Supabase sessions, **`invalidateProfileCache`**, write `audit_log`. _(tracker P-2)_
  - 🧪 **`GET /api/account/export`** — portable JSON of all user data (Art. 20). _(tracker P-1)_
- **Mobile (👨‍💻):** complete auth flow wired to API; **consent UI at signup** (explicit, no pre-tick); profile view/edit/avatar; account settings (change password, delete account, export).
- **Admin (👨‍💻):** users list + detail (read).
- **Legal/Design:** ⛔🔒 **DPIA completed** → lock schema. Privacy Policy / ToS first draft → legal review. Community/profile mockups.
- **Blocker:** ⛔ **Erasure + export must exist before any beta testers** (beta testers are real users → GDPR applies).

## Sprint 3 — Communities + membership + block/mute (≈ Jul 7 – 18)

- **Backend (👨‍💻):** 🧪 communities `create/browse/get/join/leave`, `community_memberships` (member/moderator/admin roles), **block** endpoints (build now — retrofitting touches every content query, TRANSFER §5.3), generic `POST /api/reports`. **Note:** only **block** ships in v1 — **mute is deferred** (no mute schema/model; adding one is a DPIA-gated schema change). The earlier "block/mute" wording is block-only until/unless mute is scoped post-DPIA.
- **Mobile (👨‍💻):** community browse / detail / create / join-leave screens; block UI (mute deferred — no model, DPIA-gated).
- **Admin (👨‍💻):** communities CRUD; reports queue (read).
- **Design:** chat + events mockups.
- **Blocker:** community-join rate limit (`checkCommunityJoinRateLimit`) wired.

## Sprint 4 — Posts + reporting/moderation + Safety features (≈ Jul 21 – Aug 1)

- **Backend (👨‍💻):** 🧪 posts `create/view/delete`, report a post; **moderation actions** (resolve report, remove content, ban/mute user) → `audit_log`; `new_community_post` push; `contentCreateUser` rate limit.
- **Mobile (👨‍💻):** post feed + composer + report flow; **safety**: discreet-icon setting + **emergency contacts** screen (quick-exit overlay already built in scaffold — wire the trigger everywhere).
- **Admin (👨‍💻):** **Reports** + **Moderation** pages complete (review, resolve, ban/mute, action history).
- **Design:** safe-places + premium + paywall mockups.
- **Account Suspension & Appeals (extends moderation; `docs/MODERATION_APPEALS.md`):** closes the gap where a banned user can still log in and only sees a generic error. Three sequenced slices — **P-20** mobile suspension UX (no schema → ship first), **P-21** ban reason (`moderation_actions`) + discreet email (DPIA + Resend-domain gated), **P-22** in-app appeals (`appeals`) Instagram/Facebook-style (DPIA-gated). Email must be discreet (Article 9 shared-inbox safety); the appeal window/SLA + reason categories are 🏢 client policy.
- **Backlog — "Deactivate account" (account-control / safety, NOT GDPR erasure):** a **reversible pause**, distinct from `DELETE /api/account` (Sprint 2, irreversible erasure). High-level intent (data model / UX / reactivation rules to be designed when built): while deactivated, the user is **hidden/disabled** from public + community surfaces; login/session access is **blocked or heavily limited** until reactivation; **data is retained** (not erased); **audit logs kept**. This is a user-safety control (step back without losing the account), so it lives here, not on the Sprint-2 GDPR critical path — **it must not delay export/erasure.**

## Sprint 5 — Community chat (Supabase Realtime Broadcast) (≈ Aug 4 – 15)

**Goal:** the riskiest, newest feature — dedicated sprint (no Even Tab equivalent).

- **Backend (👨‍💻):** 🧪 `POST /api/communities/:id/messages` (persist to `messages` **then** broadcast on `chat:{communityId}`), `GET …/messages` history (HTTP, not Realtime), message delete → `[deleted]`. `server/realtime.ts` publish helper.
- **Mobile (👨‍💻):** chat screen + `useCommunityChat` hook enforcing the **mandatory connection lifecycle** (subscribe only on active foreground chat screen; `removeChannel` on navigate-away; `removeAllChannels` on background; resubscribe on foreground — TRANSFER §3.9). History via HTTP, new messages via Broadcast. Client connects with `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Broadcast only).
- **Admin (👨‍💻):** view reported messages in moderation.
- **Infra:** 🔒 verify current Supabase Realtime concurrent-connection limits/pricing before assuming scale (CLAUDE.md gotcha).
- **Tests:** message persistence + message erasure (content cleared on account deletion).
- **Delivery note (slicing):** built backend-first. **Backend slice** (`feat/community-chat-backend`): the HTTP messages API (`GET/POST /communities/:id/messages`, `DELETE /messages/:id`, `POST /messages/:id/report`), member-gated read+write, cursor + block filter, atomic guarded soft-delete, `server/realtime.ts` publish helper (private `chat:{communityId}` channel, post-commit best-effort broadcast). **Mobile slice** (after): the Messages inbox + thread, the `useCommunityChat` live hook + mandatory connection lifecycle + client-side block-filter of live messages, **and** the Realtime subscription authorization (private channels: client `setAuth` with the user JWT; RLS policy on Supabase's internal `realtime.messages` + a `SECURITY DEFINER` membership check — app-table zero-policy unchanged). UI rich features (reactions, images, pins, presence, search, unread) layer in after the baseline thread.

### Direct messages (1:1) — dedicated later chat slice (in v1, **not** Sprint 5)

1:1 DMs **are in the launch product**, built as their own **safety/DPIA-gated** slice **after** community chat (reuses the Broadcast + Postgres foundation on a `dm:{conversationId}` channel). Social model stays community-centric — **no friend graph** (TRANSFER §3.9 / line 469 deliberately did not port Even Tab's friend system). Scope:

- **Contact model:** community-gated **message requests** — you may DM only someone you share a community with; the first message lands in a **requests** inbox (accept / decline / block) before the thread opens. The "connection" is just an accepted conversation thread.
- **Safety from day one:** block both directions; report a specific DM message → existing moderation queue; moderator access to reported DM content is **report-gated + audited + DPIA/privacy-policy-disclosed** (reported message + small context only, no browsing all DMs); admin remove content / ban; rate limits; erasure + export coverage; **no E2EE** (moderation needs server-readable reported content); **no screenshot uploads** in v1 (prefer the stored message).
- **Schema/DPIA:** new `conversations` + `direct_messages` tables (plaintext, explicit ON DELETE, sender SET NULL / content `[deleted]` on erasure) + `new_direct_message` push (sender alias only, never content). **Schema not locked before the DPIA covers DMs.**
- **Deferred entirely (post-v1):** ad-hoc group chats (hand-picked private groups) — the one shape that would need friend/group machinery.

## Sprint 6 — Events + RSVP + notification _plumbing_ (≈ Aug 18 – 29)

> **Status correction (2026-07-05):** the events half shipped in full (backend #44, feed/detail/RSVP #45, create #46, detail redesign #47, Home rail #48, ⋯/report #50, cancel/past #51/#52, save #56/#57, categories #58/#59). **Notifications did NOT ship "complete"** — only the _sending pipeline_ was built (`server/notifications.ts` `notifyUser`/`notifyCommunityMembers` → Expo push + prefs check + stale-token cleanup), wired best-effort into **new posts + new events**. See the ⚠️ items below — until they land, **no device actually receives a push** (there's no token-registration route, so `getActiveTokensForUser` is always empty). Title was "notifications complete"; corrected.

- **Backend (👨‍💻):** ✅ events `create/browse/get/RSVP`, `event_rsvps`; ✅ `notifyCommunityMembers` sending pipeline. **⚠️ Still open:**
  - ⚠️ **`POST/DELETE /api/push-tokens`** — device Expo-push-token register/deregister (rate limiter `checkPushTokenRateLimit` already scaffolded; client `usePushNotifications.ts` + `deregisterPushToken` exist but have no endpoint to call). **Without this, notifications are dead-lettered.** _(tracker P-20 follow-up)_
  - ⚠️ **`GET/PATCH /api/notification-preferences`** — read/update the per-user prefs the pipeline already checks.
  - ⚠️ **Scheduled job** (Fly cron / Supabase scheduled fn) for `event_reminder` push **and** retention cleanup (soft-delete purge, audit-log purge, inactivity warnings — COMPLIANCE §5.4). Retention is a **compliance requirement — don't skip.**
- **Mobile (👨‍💻):** ✅ events list/detail/create/RSVP. **⚠️ Still open:** **notification-preferences** screen; wire the token register-on-login / deregister-on-logout; the remaining push types (only `new_community_post` + `new_event` are wired — `event_reminder`, `community_invite`, `new_member_joined`, `moderation_action` are not).
- **Admin (👨‍💻):** ✅ events CRUD (backend #44 + admin-web event removal #49).
- **Where this lands:** the ⚠️ notification pieces slipped past Sprint 6; fold them into the Sprint 7 content sprint or a dedicated "notifications delivery" slice before beta (push is needed for `event_reminder` + `moderation_action`, and the retention cron is a launch compliance gate).

## Sprint 7 — Safe places + Support & Education + Safety/News/Initiatives content + Store kickoff (MONTH 4) (≈ Sep 1 – 12)

**Goal:** the content pillars (deck pillars 3 + 4) done; **store pipeline starts now, not at the end.**

> **Deck reconciliation (2026-07-05):** the original Sprint-7 line said only "Resources + emergency contacts", which **under-scoped the deck's pillars 3 + 4**. The deck promises, under **Support & Education** — _contacts to psychologists/organizations/hotlines, an LGBT rights guide, coming-out support, mental-health resources_ — and under **Safety, News & Initiatives** — _LGBT news (Poland + EU), anonymous surveys, statistics, volunteering_. Those were captured as tracker items (**P-31/P-32/P-33/P-37**) during the 2026-06-27 pitch-deck reconciliation but never folded into the sprint plan; doing that now. Some of pillar-4's News/Initiatives may **fast-follow** post-launch (see scope-cut plan) — but they must be _on the plan_, not invisible.

- **Backend (👨‍💻):**
  - 🧪 **Safe places** — ✅ largely done (the **P-40 epic**: read API + admin CRUD #60, admin CRUD page SP-1 #61, OSM import SP-2 #62, mobile list/search SP-3 #63, save #64, images SP-6a #65, detail #66, accessibility. **Remaining:** map + near-me **SP-4**, user submissions **SP-5**). `GET /api/safe-places` is **city-level only, ephemeral query coords — no GPS persistence**, COMPLIANCE §5.8.
  - 🧪 **Support & Education content** (**P-37**, deck pillar 3) — a `resources` content API (admin-curated: LGBT rights guide, coming-out support, mental-health resources) + **structured emergency/crisis contacts** (psychologists, organizations, hotlines). 🔒 **Safety bar:** hotline/crisis data is **life-critical — verified, Poland-specific, kept current** (a wrong number is a real-world harm).
  - 🧪 **News** (**P-31**, deck pillar 4) — LGBT news (Poland + EU). Recommend **admin-curated** (`news` table + admin CRUD + a mobile feed) for v1; an aggregated third-party feed adds copyright + a processor + external-content moderation (heavier). _May fast-follow._
  - 🧪 **Initiatives** (**P-32**, deck pillar 4) — **anonymous surveys** (responses NOT linkable to a user — privacy-by-design, Article-9 care), **statistics** (aggregate/anonymised only), **volunteering** listings (reuse the safe-places/events content + admin-CRUD pattern). _Lower priority; may fast-follow._
- **Mobile (👨‍💻):** safe-places **map view** (🔒 Mapbox/OSM with GDPR terms — _not_ Google unless DPA), category filter, detail (**SP-4**); **resources/support** screens + emergency contacts (**P-37**); **news** feed (**P-31**); **initiatives** surfaces (**P-32**). **Networking profile depth** (**P-33**, deck pillar 1) — a viewable profile (alias + optional bio/interests; city-level only) — schedule here or as its own slice; 🔒 Article-9 care ("interests" can imply orientation — optional, user-controlled).
- **Admin (👨‍💻):** safe-places CRUD ✅; **resources CRUD**, **news CRUD**, **initiatives/surveys CRUD** (as those land).
- **Store (👨‍💻 + 🏢):** ⛔ **EAS production profile** with the Fly.io API URL; first **TestFlight internal** build; **Android internal testing** track; 🔒 **Apple content-policy review** for LGBT+ content (know the rules before submission); **age-rating** questionnaires.
- **Legal (🏢🔒):** ⛔ **Privacy Policy + ToS LIVE at a URL** (required for store listings + first real testers); **map provider DPA** documented.
- **Design:** App Store screenshots + preview video; Play screenshots + feature graphic.
- **Blocker:** ⛔ TestFlight needs the Apple account (Week 0) + EAS + live privacy policy.

## Sprint 8 — Premium subscriptions (RevenueCat) (≈ Sep 15 – 26)

- **Backend (👨‍💻):** 🧪 ⛔ **RevenueCat webhook** — verify `Authorization` against **`req.rawBody`**, 400 on failure, sync `subscriptions` table (tracker P-3); premium-gate middleware/helpers.
- **Mobile (👨‍💻):** RevenueCat SDK, **paywall**, premium feature gates, restore purchases.
- **Admin (👨‍💻):** subscriptions view (status per user).
- **Infra (👨‍💻 + 🏢):** RevenueCat account + **product configuration** in App Store Connect + Play Console; `REVENUECAT_WEBHOOK_SECRET` in Fly. 🔒 In-app-purchase products require the client's **banking/tax agreements** in App Store Connect + Play Console.
- **Store:** wider TestFlight beta; Play closed testing.
- **Blocker:** ⛔ products can't be created until store agreements + listings (S7) exist.

## Sprint 9 — Curated ads + admin completeness + polish (≈ Sep 29 – Oct 10)

- **Backend (👨‍💻):** 🧪 `GET /api/ads` (serve active campaigns; **suppressed for premium users**); admin ad-campaign CRUD + scheduling.
- **Mobile (👨‍💻):** ad display slots (respect premium); empty/error/loading states across the app; accessibility pass.
- **Admin (👨‍💻):** **ad campaigns** CRUD; verify full CRUD coverage for **all** entities (users, communities, events, safe places, reports, ads).
- **Testing:** full regression; **admin dashboard browser testing**.
- **Store:** address TestFlight/closed-testing feedback.

## Sprint 10 — Hardening + Store submission (≈ Oct 13 – 24)

- **Backend (👨‍💻):** rate-limit + fail-closed review; confirm retention job; Sentry alerting; **Fly.io log drains** with persistent retention (COMPLIANCE §5.7); Supabase audit logs enabled (Pro).
- **Mobile (👨‍💻):** performance, TanStack `retry: 3` everywhere, full device matrix.
- **Store (👨‍💻 + 🏢):** ⛔🔒 **Submit to App Store** — budget **2–3 weeks** for review + possible rejections; **submit to Play** — budget ~1 week.
- **Legal (🏢):** all docs live; **incident response plan** written (who notifies **UODO within 72h**, COMPLIANCE §5.7 / §7).
- **Security (🔒):** schedule **third-party pre-launch security audit** (external vendor lead time — book now).

## Sprint 11 — Security audit + pre-launch content + beta feedback (≈ Oct 27 – Nov 7)

- **Security (👨‍💻 + 🔒):** run the third-party audit; 🧪 fix findings (regression test per fix).
- **Pre-launch (👨‍💻 + 🏢):** seed **initial safe places** (🏢 client provides curated data → 👨‍💻 import); create the **admin account**; **document the moderation workflow** for the client; **train the client** on the admin dashboard.
- **Copy (🏢/contractor):** **native Polish speaker reviews all copy** (UI, emails, push, store listings).
- **Store:** respond to review feedback / resubmit if rejected.

## Sprint 12 — Launch readiness + smoke test + buffer (≈ Nov 10 – 21)

- **Final checks (👨‍💻):** production **smoke test**; confirm **all env vars in Fly.io**; run the full [Launch checklist](#launch-checklist-compliance--7); final compliance sign-off.
- **Gates (🏢):** DPA signed ✓, DPIA documented ✓, Privacy/ToS live ✓, incident plan ready ✓, UODO obligations assessed ✓.
- **Release:** App Store + Play approved → release. **Buffer** absorbs store-review slippage.
- **Target launch: ~late Nov / early Dec 2026.**

---

## Critical path & external blockers (book these early)

| Item                               | Owner | Lead time              | Blocks                                      | Start by            |
| ---------------------------------- | ----- | ---------------------- | ------------------------------------------- | ------------------- |
| Apple Developer enrolment          | 🏢    | days–2 wks             | TestFlight, App Store                       | Week 0              |
| DPA signed                         | 🏢    | days–weeks             | PGC handling real user data, beta           | Week 0              |
| DPIA (lawyer)                      | 🏢    | weeks                  | **Schema lock**, location/chat finalisation | by end S2           |
| Privacy Policy + ToS live (PL)     | 🏢    | weeks                  | Store submission, real users                | by S7               |
| Resend domain verification         | 👨‍💻    | hours–days             | Real transactional email                    | Week 0              |
| Map provider DPA                   | 🏢    | days                   | Safe places launch                          | by S7               |
| IAP store agreements (banking/tax) | 🏢    | days–weeks             | RevenueCat products                         | by S8               |
| App Store review                   | 🔒    | 2–3 wks (+ rejections) | Launch                                      | submit S10          |
| Play review                        | 🔒    | ~1 wk                  | Launch                                      | submit S10          |
| Third-party security audit         | 🔒    | book ahead             | Launch sign-off                             | book by S9, run S11 |

## Client (🏢) vs PGC (👨‍💻) responsibilities

**Client (data controller) — must own:** Apple/Play accounts + store agreements + banking/tax; DPA signature; DPIA (with lawyer); Privacy Policy / ToS / cookie policy (drafting + legal review + hosting); UODO assessment; incident response plan; age-verification policy decision; map-provider DPA; curated safe-places data; final Polish copy approval.

**PGC (processor) — builds/operates:** all backend/mobile/admin code; all infra provisioning; EAS builds + store-submission mechanics; CI/tests; admin tooling; data seeding/import; the deletion/export/retention systems that make the client's compliance enforceable; client training delivery.

---

## Launch checklist (COMPLIANCE §7)

**Client must have:** DPA signed · Privacy Policy reviewed + live · consent UI approved · DPIA documented · UODO obligations assessed · incident-response plan · data-subject-request process · map-provider DPA.

**PGC must have built/verified:** `consent_records` + non-skippable consent at signup · `audit_log` + retention · `DELETE /api/account` erasure (with `invalidateProfileCache`) tested against **every** table · `GET /api/account/export` · scheduled cleanup job · Sentry alerting · Fly log drains · Supabase audit logs · encryption posture (infra-level, no E2EE) documented · all `ON DELETE` behaviours verified · location ephemeral-only / city-level · map-provider DPA noted in code.

---

## Scope risk — what to cut if behind

This is **aggressive for two developers** even with AI. If a sprint slips, protect the **compliance + safety + core-community** path and defer revenue/polish:

1. **Never cut / never slip:** consent at signup, erasure/export, audit log, moderation/report, block/mute, quick-exit. These are legal/safety gates.
2. **Core v1:** auth, profiles, communities, chat, posts, events, safe places, push, admin CRUD.
3. **Cut/slip first if needed:** curated **ads** (revenue, but not launch-critical) → fast-follow; **resources/education** depth → ship minimal; **premium** could fast-follow if IAP/store agreements stall (but it's a revenue pillar — prefer to keep).
4. If the date ever compresses (e.g. a hard external deadline): cut ads + premium to fast-follow, trim events/safe-places scope, and treat chat as the single biggest schedule risk.

---

_Living document — update at each sprint boundary. Pair with `CLAUDE.md`'s Issue Tracker (P-1..P-5 blockers, accepted risks AR-1/AR-2) and the four context docs._
