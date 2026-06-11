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

| Tag | Meaning |
|---|---|
| 👨‍💻 PGC | Pretty Good Company (the developers / data processor) does it |
| 🏢 Client | The client (data controller) does it — PGC cannot do these |
| 🔒 | External blocker — depends on a third party / lead time outside our control |
| ⛔ | Hard gate — downstream work cannot start until this is done |
| 🧪 | Ships with an integration test on the same branch (ENGINEERING_STANDARDS §11) |

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

## Week 0 — START IMMEDIATELY (parallel with Sprint 1)

These have lead times and **block** later work. Kick all of them off in the first days.

### Developer accounts — 🏢 Client (start day 1; some take days)
- ⛔🔒 **Apple Developer Program** — $99/yr, enrolment + identity verification can take **several days to 2 weeks**. Blocks TestFlight, App Store. **Start now.**
- 🔒 **Google Play Developer** — $25 one-time, ~1–2 days. Blocks Play testing/submission.
- **App Store Connect** app record + **Play Console** app record (after accounts exist).
- *Why client:* store accounts and their banking/tax agreements belong to the business entity that publishes the app.

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
  - 🧪 ⛔ **`DELETE /api/account`** — full transactional anonymisation cascade (COMPLIANCE §5.2): clear PII, content → `[deleted]`, drop memberships/RSVPs/tokens/consents, revoke Supabase sessions, **`invalidateProfileCache`**, write `audit_log`. *(tracker P-2)*
  - 🧪 **`GET /api/account/export`** — portable JSON of all user data (Art. 20). *(tracker P-1)*
- **Mobile (👨‍💻):** complete auth flow wired to API; **consent UI at signup** (explicit, no pre-tick); profile view/edit/avatar; account settings (change password, delete account, export).
- **Admin (👨‍💻):** users list + detail (read).
- **Legal/Design:** ⛔🔒 **DPIA completed** → lock schema. Privacy Policy / ToS first draft → legal review. Community/profile mockups.
- **Blocker:** ⛔ **Erasure + export must exist before any beta testers** (beta testers are real users → GDPR applies).

## Sprint 3 — Communities + membership + block/mute (≈ Jul 7 – 18)

- **Backend (👨‍💻):** 🧪 communities `create/browse/get/join/leave`, `community_memberships` (member/moderator/admin roles), **block/mute** endpoints (build now — retrofitting touches every content query, TRANSFER §5.3), generic `POST /api/reports`.
- **Mobile (👨‍💻):** community browse / detail / create / join-leave screens; block/mute UI.
- **Admin (👨‍💻):** communities CRUD; reports queue (read).
- **Design:** chat + events mockups.
- **Blocker:** community-join rate limit (`checkCommunityJoinRateLimit`) wired.

## Sprint 4 — Posts + reporting/moderation + Safety features (≈ Jul 21 – Aug 1)

- **Backend (👨‍💻):** 🧪 posts `create/view/delete`, report a post; **moderation actions** (resolve report, remove content, ban/mute user) → `audit_log`; `new_community_post` push; `contentCreateUser` rate limit.
- **Mobile (👨‍💻):** post feed + composer + report flow; **safety**: discreet-icon setting + **emergency contacts** screen (quick-exit overlay already built in scaffold — wire the trigger everywhere).
- **Admin (👨‍💻):** **Reports** + **Moderation** pages complete (review, resolve, ban/mute, action history).
- **Design:** safe-places + premium + paywall mockups.
- **Backlog — "Deactivate account" (account-control / safety, NOT GDPR erasure):** a **reversible pause**, distinct from `DELETE /api/account` (Sprint 2, irreversible erasure). High-level intent (data model / UX / reactivation rules to be designed when built): while deactivated, the user is **hidden/disabled** from public + community surfaces; login/session access is **blocked or heavily limited** until reactivation; **data is retained** (not erased); **audit logs kept**. This is a user-safety control (step back without losing the account), so it lives here, not on the Sprint-2 GDPR critical path — **it must not delay export/erasure.**

## Sprint 5 — Community chat (Supabase Realtime Broadcast) (≈ Aug 4 – 15)

**Goal:** the riskiest, newest feature — dedicated sprint (no Even Tab equivalent).

- **Backend (👨‍💻):** 🧪 `POST /api/communities/:id/messages` (persist to `messages` **then** broadcast on `chat:{communityId}`), `GET …/messages` history (HTTP, not Realtime), message delete → `[deleted]`. `server/realtime.ts` publish helper.
- **Mobile (👨‍💻):** chat screen + `useCommunityChat` hook enforcing the **mandatory connection lifecycle** (subscribe only on active foreground chat screen; `removeChannel` on navigate-away; `removeAllChannels` on background; resubscribe on foreground — TRANSFER §3.9). History via HTTP, new messages via Broadcast. Client connects with `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Broadcast only).
- **Admin (👨‍💻):** view reported messages in moderation.
- **Infra:** 🔒 verify current Supabase Realtime concurrent-connection limits/pricing before assuming scale (CLAUDE.md gotcha).
- **Tests:** message persistence + message erasure (content cleared on account deletion).

## Sprint 6 — Events + RSVP + reminders + notifications complete (≈ Aug 18 – 29)

- **Backend (👨‍💻):** 🧪 events `create/browse/get/RSVP`, `event_rsvps`; **scheduled job** (Fly cron / Supabase scheduled fn) for `event_reminder` push **and** retention cleanup (soft-delete purge, audit-log purge, inactivity warnings — COMPLIANCE §5.4); `new_event` push.
- **Mobile (👨‍💻):** events list/detail/create/RSVP; **notification preferences** screen; wire **all** push types (`new_community_post`, `new_event`, `event_reminder`, `community_invite`, `new_member_joined`, `moderation_action`).
- **Admin (👨‍💻):** events CRUD.
- **Infra:** retention job is a compliance requirement — don't skip.

## Sprint 7 — Safe places + Resources + Store kickoff (MONTH 4) (≈ Sep 1 – 12)

**Goal:** content features done; **store pipeline starts now, not at the end.**

- **Backend (👨‍💻):** 🧪 `GET /api/safe-places` (filter by category, **city-level only, ephemeral query coords — no GPS persistence**, COMPLIANCE §5.8); resources/support content API; emergency-contacts content.
- **Mobile (👨‍💻):** **map view** (🔒 Mapbox/OSM with GDPR terms — *not* Google unless DPA), category filter, safe-place detail; resources/support screens; emergency contacts.
- **Admin (👨‍💻):** safe-places CRUD, resources CRUD.
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

| Item | Owner | Lead time | Blocks | Start by |
|---|---|---|---|---|
| Apple Developer enrolment | 🏢 | days–2 wks | TestFlight, App Store | Week 0 |
| DPA signed | 🏢 | days–weeks | PGC handling real user data, beta | Week 0 |
| DPIA (lawyer) | 🏢 | weeks | **Schema lock**, location/chat finalisation | by end S2 |
| Privacy Policy + ToS live (PL) | 🏢 | weeks | Store submission, real users | by S7 |
| Resend domain verification | 👨‍💻 | hours–days | Real transactional email | Week 0 |
| Map provider DPA | 🏢 | days | Safe places launch | by S7 |
| IAP store agreements (banking/tax) | 🏢 | days–weeks | RevenueCat products | by S8 |
| App Store review | 🔒 | 2–3 wks (+ rejections) | Launch | submit S10 |
| Play review | 🔒 | ~1 wk | Launch | submit S10 |
| Third-party security audit | 🔒 | book ahead | Launch sign-off | book by S9, run S11 |

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

*Living document — update at each sprint boundary. Pair with `CLAUDE.md`'s Issue Tracker (P-1..P-5 blockers, accepted risks AR-1/AR-2) and the four context docs.*
