/**
 * Staff admin logins sign in with just a username (their first name), not an
 * email — Supabase Auth itself only knows email addresses, so each username
 * maps to a synthetic, non-deliverable internal email
 * (e.g. "reyna@staff.peaks-admin.internal"). This file is the single source
 * of truth for that mapping and the username format rule.
 *
 * Usernames are no longer a fixed list: the owner (Reyna) and the developer
 * (Aidenn) can add new staff accounts from the Users page
 * (POST /api/admin/stylists), so new usernames can be created at any time.
 * The login page no longer pre-checks a username against a hardcoded set —
 * it just derives the synthetic email and lets Supabase's own
 * invalid_credentials response handle an unknown username, same as a wrong
 * password (so the login form never confirms or denies which usernames
 * exist).
 *
 * Because these emails aren't real inboxes, Supabase's email-based
 * password-reset flow won't reach anyone — see README.md for how account
 * password resets actually work here (the Users page, or
 * scripts/create-staff-admins.ts).
 */
const EMAIL_DOMAIN = "staff.peaks-admin.internal";
const USERNAME_PATTERN = /^[a-z][a-z0-9]{1,30}$/;

/** The four accounts that existed when this app was first set up — used only
 *  as scripts/create-staff-admins.ts's default when run with no arguments. */
export const STAFF_USERNAMES = ["reyna", "isabel", "brandon", "aidenn"] as const;

export function isValidUsernameFormat(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim().toLowerCase());
}

export function usernameToSyntheticEmail(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!isValidUsernameFormat(normalized)) return null;
  return `${normalized}@${EMAIL_DOMAIN}`;
}
