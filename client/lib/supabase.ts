import { createClient } from "@supabase/supabase-js";
import { getAccessToken } from "@/lib/auth";

// Supabase client used ONLY for Realtime (community chat live delivery). It never
// reads or writes the database — all data access goes through the Express API
// (CLAUDE.md §1/§2). Realtime Broadcast bypasses the DB entirely; this is the one
// permitted client-side use of the anon key (TRANSFER §3.9, CLAUDE.md §2).
//
// Chat channels are PRIVATE and authorized per user (supabase/realtime-auth.sql):
// call setRealtimeAuth() with the session JWT BEFORE subscribing so the
// realtime.messages RLS policy can resolve auth.uid() and check membership.

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Point the Realtime socket at the current user's access token so private-channel
// authorization (RLS on realtime.messages) sees auth.uid(). Safe to call before
// each (re)subscribe. No-op effect if there's no token (subscription will then
// fail the policy, which is correct — unauthenticated can't read chat).
export async function setRealtimeAuth(): Promise<void> {
  const token = await getAccessToken();
  supabase.realtime.setAuth(token ?? "");
}
