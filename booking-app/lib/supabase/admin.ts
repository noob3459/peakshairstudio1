import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS, never import this from anything that
 * runs in the browser. Used only by scripts/create-admin-user.ts today.
 * SUPABASE_SERVICE_ROLE_KEY is a server-only env var (no NEXT_PUBLIC_ prefix).
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. See booking-app/README.md.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
