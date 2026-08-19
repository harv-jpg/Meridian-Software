import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client that bypasses row-level security entirely.
 *
 * This is the only such client in the app, and it exists for one reason: the
 * nightly job runs with nobody signed in. `auth.uid()` is null there, so every
 * policy in the schema evaluates false and an ordinary client would read
 * nothing at all.
 *
 * Because RLS is not protecting these queries, the caller is. Every read in
 * the job filters on `user_id` explicitly, and every row written carries the
 * `user_id` it was derived from. If you add a query here that does not name a
 * user, it will silently read the whole table across every account.
 *
 * Never import this from anything that serves a browser request. Requests with
 * a signed-in user go through `server.ts`, where RLS decides what is visible.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for scheduled work."
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
