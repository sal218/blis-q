import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// NOTE: Newer Supabase projects require explicit GRANTs for PostgREST /
// supabase-js data access. This has zero impact on Blis-Q by design — all
// database access goes through Drizzle ORM over a direct Postgres connection
// using the service_role (see server/db.ts), never PostgREST. The anon key
// below is used solely for sign-in operations that must return a user session
// (signInWithPassword) and, client-side, for Supabase Realtime Broadcast —
// which bypasses the database entirely. No anon DB grants are needed or wanted
// (RLS zero-policy = deny-all). See CLAUDE.md §2.

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

// Admin client: uses service role key, bypasses RLS.
// For server-side user management only — never exposed to the client.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Regular client: uses anon key, used for sign-in operations that must
// return a user session (signInWithPassword).
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
