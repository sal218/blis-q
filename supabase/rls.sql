-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security — ZERO-POLICY MODEL
--
-- RLS is enabled on every table and NO policies are created. RLS enabled with
-- zero policies = deny-all for the anon and authenticated roles. This is a
-- deliberate deny-all firewall, not an oversight. See CLAUDE.md §2 and
-- TRANSFER_CONTEXT_EVENTAB_TO_BLISKO.md §3.2 Rule 2.
--
--   • The anon key has ZERO database access (the only client-side use of the
--     anon key is Supabase Realtime Broadcast, which bypasses the database).
--   • ALL database access happens via the service_role, which BYPASSES RLS by
--     design, and only inside the Express backend (Drizzle over direct Postgres).
--   • NEVER add a `CREATE POLICY` statement to this file. If the frontend needs
--     data, build a backend endpoint — do not open an RLS policy.
--
-- This cannot live in the Drizzle schema (Drizzle does not manage RLS), so it is
-- applied separately. Run it against the database after `npm run db:push`:
--   psql "$DATABASE_URL" -f supabase/rls.sql
-- It is idempotent — ENABLE ROW LEVEL SECURITY is safe to run repeatedly.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities               ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps               ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_saves               ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_places               ENABLE ROW LEVEL SECURITY;
ALTER TABLE safe_place_saves          ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_push_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens     ENABLE ROW LEVEL SECURITY;
