-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Realtime Authorization — community chat private channels
--
-- This is the ONE intentional exception to the zero-policy model (see
-- supabase/rls.sql / CLAUDE.md §2). It does NOT touch any APP table — the policy
-- lives on Supabase's INTERNAL `realtime.messages` table, which authorizes
-- subscriptions to PRIVATE Realtime channels. App tables remain deny-all; the
-- anon/authenticated roles still get ZERO app-table access.
--
-- Why: community chat delivers live messages over the private channel
-- `chat:{communityId}`. Without authorization, anyone with the anon key could
-- subscribe and read a community's live messages — an Article 9 leak. With this
-- policy, a client may only RECEIVE on `chat:{communityId}` if it is an
-- authenticated, NON-BANNED, NON-ERASED member of that (non-deleted) community.
-- The client authenticates its Realtime socket with the user's Supabase JWT
-- (realtime.setAuth) so `auth.uid()` resolves here.
--
-- Ban/erasure gate (AUTH-1): the predicate joins `public.users` and requires
-- `banned_at IS NULL AND deleted_at IS NULL`, mirroring the HTTP isAuthenticated
-- ban/deleted gate at the Realtime layer. A ban sets `users.banned_at` but cannot
-- revoke the target's Supabase session by user id (see CLAUDE.md P-8), so without
-- this join a just-banned user's still-valid JWT would keep authorizing chat
-- subscriptions and receiving live messages until the token expired. The join
-- denies them at the next subscribe/setAuth check instead. (Instant kill of an
-- already-open pre-ban socket is deferred to P-8's session-revocation work; the
-- residual is bounded to the access-token lifetime.)
--
-- SELECT only: clients only RECEIVE broadcasts. The server PUBLISHES via the
-- service_role (HTTP broadcast endpoint, server/realtime.ts), which bypasses RLS
-- — so no INSERT policy is created (clients must never broadcast directly).
--
-- Apply separately (NOT via Drizzle / db:push), human-run, after rls.sql — see
-- docs/DEPLOY.md:
--   psql "$DATABASE_URL" -f supabase/realtime-auth.sql
-- Idempotent: the function is CREATE OR REPLACE; the policy is dropped+recreated.
-- ─────────────────────────────────────────────────────────────────────────────

-- Authorization predicate for a `chat:{uuid}` topic. SECURITY DEFINER so it can
-- read membership despite the app-table deny-all; it returns ONLY a boolean
-- decision and never exposes rows. Hardened: empty search_path, schema-qualified
-- tables, anchored topic regex + exception-safe uuid cast (topic injection →
-- false), the live-community gate (a soft-deleted community authorizes no one),
-- and the caller-active gate (banned_at/deleted_at IS NULL) — together mirroring
-- the GET /messages + isAuthenticated gates in server/routes/chat.ts + auth.ts.
CREATE OR REPLACE FUNCTION public.chat_topic_is_member(topic text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cid uuid;
BEGIN
  IF topic !~ '^chat:[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  BEGIN
    cid := substring(topic FROM 6)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1
    FROM public.community_memberships m
    JOIN public.communities c ON c.id = m.community_id
    JOIN public.users u ON u.id = m.user_id
    WHERE m.community_id = cid
      AND m.user_id = auth.uid()
      AND c.deleted_at IS NULL
      AND u.banned_at IS NULL
      AND u.deleted_at IS NULL
  );
END;
$$;

-- Only authenticated users may execute it; never anon/public.
REVOKE EXECUTE ON FUNCTION public.chat_topic_is_member(text) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.chat_topic_is_member(text) TO authenticated;

-- Receive-only authorization on private Broadcast channels named `chat:*`.
DROP POLICY IF EXISTS "chat broadcast read for members" ON realtime.messages;
CREATE POLICY "chat broadcast read for members"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'broadcast'
  AND realtime.topic() LIKE 'chat:%'
  AND public.chat_topic_is_member(realtime.topic())
);
