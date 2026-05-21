// Service-role Supabase client — bypasses RLS.
// Use ONLY in server-side cron routes and admin scripts.
// NEVER import this from a client component or anything that ships to the browser.
//
// The new Supabase API key system (sb_secret_...) replaces the legacy service_role JWT.
// Capability is identical (full DB access, RLS bypass); the new format is just
// individually revocable and not tied to a 10-year JWT.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not configured");
  if (!key) throw new Error("SUPABASE_SECRET_KEY not configured");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
