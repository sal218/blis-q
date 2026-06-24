# Blis-Q (Blisko) — Data Processing Summary for the DPIA

**Purpose of this document.** This is a plain-language summary of how the Blis-Q
app processes personal data, prepared by the **development team (the data
processor)** so the **client (the data controller)** and their legal counsel can
make sure the **DPIA covers everything**. It is a living document — we will update
it as the build evolves or as new processing is added. **It is not legal advice**;
it is the technical input the lawyer needs to assess the risks.

---

## 1. What the app is

Blis-Q is a community platform (iOS + Android, plus an internal admin web
dashboard) for **Poland's LGBT+ community**. Planned features: community groups +
group chat, events + RSVPs, a map of LGBT-friendly "safe places", support /
education resources, safety tools, and a premium subscription tier.

**Build status (so nothing here reads as already live).** A DPIA assesses planned
processing too, so planned features are included below — but for accuracy:

- **Implemented:** account sign-up/login (email + Google Sign-In), explicit
  consent capture, account export + deletion/anonymisation, community groups,
  posts + reporting, moderation (reports queue, content removal, user
  ban/suspension), and the internal admin dashboard.
- **Planned (not yet built):** group chat, the safe-places map, events/RSVPs,
  premium subscriptions, and the **emergency-contacts** section.

## 2. Roles

- **Data controller — the client.** Operates Blis-Q, owns the product, decides
  what data is collected and why. Holds the primary legal obligations, including
  the DPIA.
- **Data processor — the development team.** Builds and operates the system on the
  client's instructions. A **Data Processing Agreement (Art. 28)** must be signed
  between the two parties before any real user data is handled.

## 3. Why a DPIA is mandatory (the high-risk triggers)

The app meets **at least four** of the EDPB high-risk criteria (two are enough to
require a DPIA):

1. **Special-category data (Art. 9)** — sexual orientation.
2. **Vulnerable persons** — LGBT+ individuals in Poland's current climate.
3. **Large-scale processing** — the product targets tens of thousands of users.
4. **Location data** — the (planned) "safe places" map.

## 4. The Article 9 point (the most important risk)

Under GDPR, **sexual orientation is "special category" data (Article 9)** — the
highest-protection tier. Critically, this is triggered **just by having an
account**: joining a platform described as being for the LGBT+ community itself
reveals sexual orientation. So the controller is processing Article 9 data **from
the moment a user registers**, regardless of what they post.

- **Legal basis:** the realistic basis is **Article 9(2)(a) — explicit consent**:
  freely given, specific, informed, unambiguous, via a clear affirmative action
  (no pre-ticked boxes), withdrawable, and recorded **per user, per purpose, per
  privacy-policy version**.

## 5. Personal data the app processes

- **Account:** email, display name (a chosen alias), avatar, premium/subscription
  status, admin flag.
- **Account status / moderation:** suspension (ban) state and timestamp; the admin
  user directory (admins can list/search users by name/email and see status); and
  **moderation actions** — report status / resolution / reviewer, and content
  removal / ban records.
- **Consent records:** what was consented to, policy version, timestamps, and the
  IP at consent (short retention, for audit).
- **User content:** community posts, content reports, blocks; and (planned)
  group-chat messages (see §7).
- **Activity:** community memberships; (planned) event RSVPs.
- **Notifications:** device push tokens, notification preferences.
- **Security/audit:** an audit log of significant actions (**IDs only** — no message
  content, no PII, no reasons/resolution text), plus limited IP addresses for
  security / rate-limiting.
- **Location:** see §6 — user location is handled ephemerally and **not stored**.
- **Age / date of birth:** **not currently collected.** Whether the app is
  restricted to adults or collects DOB is an open controller decision (see §14).

## 6. Location data (planned safe-places map)

- **User location:** requested **only at the point of use** (when the user opens
  the map), never at launch or in the background. **User GPS coordinates are not
  stored** — "near me" searches use them for a single query and discard them (not
  written to the database, logs, or analytics). A preferred area, if set, is stored
  at **city level only** (e.g. "Warsaw"), never precise coordinates.
- **Venue data:** the safe-places list itself (name, address, category, and
  **venue coordinates**) is **admin-curated and stored** in the database. This is
  business/venue data, not user location — but the controller should confirm how it
  is treated.
- The map provider (e.g. Mapbox / OpenStreetMap) needs its own DPA; the DPIA should
  address location processing specifically.

## 7. Messaging and moderation (planned chat; no end-to-end encryption — deliberate)

- Planned group-chat messages will be stored in the database in **plaintext**
  (encrypted **at rest** by the infrastructure provider — see §8) and **readable by
  moderators / the processor with database access**.
- **End-to-end encryption was deliberately rejected**, because it would make
  content moderation impossible — and for a vulnerable community, the ability to
  review and act on reported/harmful content is a safety-critical feature.
- This must be **disclosed in the privacy policy**: messages are stored on the
  servers, may be reviewed by moderators in response to reports, and the processor
  has technical access to database content.

## 8. Encryption and security measures

- **In transit:** all traffic uses **TLS/HTTPS** between the apps, the API, and the
  backing services (TLS terminated at the hosting layer). **In place.**
- **At rest:** the database (Supabase / AWS) and file storage (Cloudflare R2)
  encrypt data at rest with **AES-256**, handled by the providers. **In place.**
- **Application-level / end-to-end encryption:** **not used** — a deliberate
  decision so moderators can review reported content (see §7). Content is therefore
  readable server-side and protected by the in-transit + at-rest measures above.
- **Other measures:** backend-only database access (the apps never talk to the DB
  directly), rate limiting on sensitive endpoints, audit logging, and error
  monitoring.

## 9. Safety features (please confirm DPIA coverage)

For this vulnerable audience the app includes safety-specific features:

- **Quick-exit / discreet mode** — built in an earlier scaffold but currently
  **paused** pending a product/safety review.
- **Emergency / support contacts (planned, not built)** — a section that will point
  users to **external crisis and support organisations** (e.g. helplines, LGBT+
  support orgs, legal aid). Because this directs vulnerable people to real-world
  organisations, the **content must be curated and vetted by the controller**, and
  we'd like the DPIA to **explicitly account for this feature** before we build it.

## 10. Sub-processors / third parties

**Core infrastructure (database, storage, cache, API hosting) is EU-region where
selected.** Other vendors (Google services, email, subscriptions, maps) **may
involve non-EU or vendor-specific processing** — each needs its own **DPA** and an
appropriate **transfer mechanism (e.g. SCCs)** confirmed by the controller.

| Service                        | Purpose                                                       | Region / notes                            |
| ------------------------------ | ------------------------------------------------------------- | ----------------------------------------- |
| Supabase                       | Database, authentication, realtime chat delivery              | Frankfurt (EU)                            |
| Cloudflare R2                  | File / image storage                                          | EU jurisdiction                           |
| Upstash Redis                  | Rate limiting + caching                                       | Frankfurt (EU)                            |
| Fly.io                         | API server hosting                                            | Warsaw (EU)                               |
| Sentry                         | Error monitoring                                              | EU data region                            |
| Firebase Cloud Messaging (FCM) | Push notifications                                            | Google — confirm DPA + transfer mechanism |
| Google Sign-In                 | Sign-in identity (Google OIDC token, exchanged for a session) | Google — confirm DPA + transfer mechanism |
| Resend                         | Transactional email                                           | Confirm DPA + transfer mechanism          |
| RevenueCat                     | Subscription management (premium, planned)                    | Confirm DPA + transfer mechanism          |
| Map provider (Mapbox / OSM)    | Safe-places map (planned)                                     | Confirm provider + DPA / EU option        |

## 11. Data-subject rights (built into the system)

- **Consent** captured at sign-up (cannot be skipped or pre-ticked) and recorded.
- **Access / portability (Art. 20):** an account-data export.
- **Erasure (Art. 17):** account deletion **anonymises** rather than hard-deletes —
  personal data is cleared, the user's content becomes anonymous "[deleted]", and
  their identity is removed, while community threads stay intact. Sessions are
  revoked and push tokens deactivated.
- **Audit log** of significant actions, with the actor anonymised on erasure.

## 12. Retention (planned — controller to confirm the exact periods for the policy)

Retention is **designed but not yet enforced** — the automated cleanup job is still
to be built. Intended periods (to confirm and put in the privacy policy):

- Soft-deleted content purged after ~30 days.
- Audit logs: ~90 days (general) / ~12 months (security-relevant).
- Consent IP addresses: short retention (~90 days).
- **Inactive accounts:** warned, then anonymised after a defined inactivity period
  (commonly 12–24 months) — **the controller needs to set this number.**

## 13. Breach readiness

Technical monitoring is in place / planned (error monitoring, log retention,
auth-event logs, rate-limit anomaly detection). The **controller needs a documented
incident-response plan** (who notifies the Polish authority **UODO within 72
hours**, and what counts as a notifiable breach).

---

## 14. What we'd ask the lawyer / controller to confirm or decide

So we can finalise the build correctly, the DPIA / controller should confirm:

1. The DPIA **explicitly covers** Article 9 data, location, the vulnerable
   population, large-scale processing — **and the emergency-contacts feature** (§9).
2. The **legal basis** (explicit consent) and the consent wording.
3. **Age / minors:** is the app **adults-only (18+)**, or will it allow minors and
   collect date of birth? (Children are a vulnerable category, and Poland's digital-
   consent age is 16 — this affects the consent flow and the DPIA.)
4. **Transfer mechanisms / DPAs** for the non-EU vendors in §10 (Google/FCM, Google
   Sign-In, Resend, RevenueCat, map provider).
5. The **inactivity / retention periods** (§12) for the privacy policy.
6. The **map provider** choice + its DPA (§6).
7. Whether a **DPO** is required, and **UODO** registration / assessment.
8. The **incident-response plan** owner (§13).
9. That the **no-E2EE / moderator-readable messages** model (§7) is reflected in
   the privacy policy.

If anything else comes up as we build, we'll flag it and update this document.
