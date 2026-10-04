import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "./supabase/server";
import { db } from "./db/client";
import { stylists } from "./db/schema";

export type CurrentStylist = typeof stylists.$inferSelect;

/**
 * Resolves the signed-in Supabase user (from the request's session cookie) to
 * their own stylist/staff row via stylists.auth_user_id — this is "who am I"
 * for every /api/admin/* route, including their accessRole ("stylist" |
 * "manager" | "dev"), which is "what can I do". Returns null if there's no
 * session, or if the session exists but isn't linked to a row (e.g. an
 * account created without running scripts/create-staff-admins.ts).
 *
 * Never trust a stylistId/role passed in from the client — always resolve it
 * from here and branch server-side.
 */
export async function getCurrentStylist(): Promise<CurrentStylist | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [stylist] = await db.select().from(stylists).where(eq(stylists.authUserId, user.id)).limit(1);
  return stylist ?? null;
}

/** Manager (Reyna) or dev (Aidenn) — anyone who can see/act across stylists. */
export function canActAcrossStylists(me: CurrentStylist): boolean {
  return me.accessRole === "manager" || me.accessRole === "dev";
}

/** Only the dev account can touch another dev account or review/export proposals. */
export function isDev(me: CurrentStylist): boolean {
  return me.accessRole === "dev";
}

/**
 * Resolves which stylist row a request should act on: the caller's own,
 * unless they asked for someone else's AND are allowed to (manager/dev) —
 * a plain stylist asking for another id is silently forced back to their own
 * rather than rejected, since that's almost certainly just the UI not
 * hiding the control fast enough, not an attack worth surfacing as an error.
 */
export async function resolveTargetStylist(
  me: CurrentStylist,
  requestedStylistId: string | null | undefined,
): Promise<CurrentStylist | null> {
  if (!requestedStylistId || requestedStylistId === me.id) return me;
  if (!canActAcrossStylists(me)) return me;

  const [target] = await db.select().from(stylists).where(eq(stylists.id, requestedStylistId)).limit(1);
  if (!target) return null;
  // A manager (not dev) can view/edit other stylists' schedules, but not a dev account's.
  if (target.accessRole === "dev" && !isDev(me)) return me;
  return target;
}
