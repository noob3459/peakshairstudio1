/**
 * Bootstraps/resets the original four staff admin accounts — one per person,
 * signing in with just their first name — and links each to a `stylists`
 * row via `auth_user_id`, which is what every /api/admin/* route uses to
 * resolve "who am I" and "what's my access level" (lib/currentStylist.ts).
 *
 * New hires after initial setup should be added from the Users page
 * (Reyna or Aidenn, POST /api/admin/stylists) instead of this script — this
 * script exists for bootstrapping and for resetting one of the original
 * four's password from the terminal if the Users page itself is unreachable
 * for some reason.
 *
 * Covers the four usernames this app shipped with:
 *   reyna (manager), isabel (stylist), brandon (stylist) — rows already
 *   exist from scripts/seed.ts, this just links + sets their access role.
 *   aidenn (dev) — no stylist row exists yet (he's not a bookable hair
 *   stylist), so this creates one with active=false (hidden from the public
 *   site and booking flow) purely to reuse the same auth-linking mechanism.
 *
 * Passwords are generated here, not supplied — usernames are already public
 * (reyna/isabel/brandon on the website; aidenn is the developer), so a
 * guessable password would defeat the point. Each is a random 16-character
 * string, printed ONCE at the end to relay securely (in person or via a
 * password manager's share feature — not plain email/SMS). Nothing is
 * written to disk or logged elsewhere.
 *
 * Safe to re-run: existing accounts get a fresh random password rather than
 * failing, so this also doubles as how you reset someone's password (these
 * accounts use a synthetic, non-deliverable email, so Supabase's email
 * password-reset flow doesn't work for them) — though the admin Users page
 * (dev/manager only) can also reset one person's password without
 * re-running this whole script.
 *
 * Usage:
 *   npx tsx scripts/create-staff-admins.ts            # all four (resets everyone's password)
 *   npx tsx scripts/create-staff-admins.ts aidenn      # just one (e.g. add/reset a single account
 *                                                       # without touching everyone else's password)
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { db } from "../lib/db/client";
import { stylists } from "../lib/db/schema";
import { STAFF_USERNAMES, usernameToSyntheticEmail } from "../lib/staffAccounts";
import { generatePassword } from "../lib/password";

type StaffUsername = (typeof STAFF_USERNAMES)[number];

const ACCESS_ROLE: Record<StaffUsername, "stylist" | "manager" | "dev"> = {
  reyna: "manager",
  isabel: "stylist",
  brandon: "stylist",
  aidenn: "dev",
};

async function ensureStylistRow(username: StaffUsername) {
  const [existing] = await db.select().from(stylists).where(eq(stylists.slug, username)).limit(1);
  if (existing) return existing;

  if (username !== "aidenn") {
    throw new Error(
      `No stylists row for "${username}" — run scripts/seed.ts first (it creates reyna/isabel/brandon).`,
    );
  }

  // Aidenn: not a bookable stylist. active=false keeps him out of the public
  // site/booking flow entirely while reusing the same table + auth-linking.
  const [created] = await db
    .insert(stylists)
    .values({
      id: randomUUID(),
      slug: "aidenn",
      name: "Aidenn",
      role: "Site Developer",
      active: false,
      accessRole: "dev",
    })
    .returning();
  return created;
}

async function main() {
  const requested = process.argv.slice(2);
  const targets: readonly StaffUsername[] = requested.length
    ? requested.map((u) => {
        const normalized = u.trim().toLowerCase();
        if (!(STAFF_USERNAMES as readonly string[]).includes(normalized)) {
          throw new Error(`Unknown username "${u}". Valid: ${STAFF_USERNAMES.join(", ")}`);
        }
        return normalized as StaffUsername;
      })
    : STAFF_USERNAMES;

  const supabase = createSupabaseAdminClient();
  const results: { username: string; password: string; status: string }[] = [];

  for (const username of targets) {
    await ensureStylistRow(username);

    const email = usernameToSyntheticEmail(username)!;
    const password = generatePassword();

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });

    let userId: string;
    let status: string;

    if (createError) {
      if (!createError.message.toLowerCase().includes("already")) {
        console.error(`Failed to create ${username}:`, createError.message);
        continue;
      }
      // Already exists — find it and reset the password instead.
      const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
      if (listError) {
        console.error(`Failed to look up existing user for ${username}:`, listError.message);
        continue;
      }
      const existing = list.users.find((u) => u.email === email);
      if (!existing) {
        console.error(`${username} reported as existing but couldn't be found — skipping.`);
        continue;
      }
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, { password });
      if (updateError) {
        console.error(`Failed to reset password for ${username}:`, updateError.message);
        continue;
      }
      userId = existing.id;
      status = "password reset (account already existed)";
    } else {
      userId = created.user.id;
      status = "created";
    }

    // Link this auth account to its stylist row and set its access level —
    // this is what the "who am I, what can I do" check in every
    // /api/admin/* route resolves against.
    await db
      .update(stylists)
      .set({ authUserId: userId, accessRole: ACCESS_ROLE[username] })
      .where(eq(stylists.slug, username));

    results.push({ username, password, status });
  }

  console.log("\n=== Staff admin accounts ===\n");
  for (const r of results) {
    console.log(`${r.username.padEnd(10)} password: ${r.password}   (${r.status})`);
  }
  console.log(
    "\nRelay these securely (in person or via a password manager's share feature), not over plain email or chat.",
  );
  console.log("Sign in at /staff/login with the username above (not an email address).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
