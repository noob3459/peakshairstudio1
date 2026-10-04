import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client — public anon key only (safe to expose; it's the standard
 * Supabase pattern and is RLS-limited, not a secret). Used solely by the
 * admin login form to call supabase.auth.signInWithPassword(), and by the
 * sign-out button to call supabase.auth.signOut().
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
