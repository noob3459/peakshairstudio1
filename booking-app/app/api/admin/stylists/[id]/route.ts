import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CONTACT_FIELDS = ["instagramHandle", "facebookHandle", "personalPhone", "personalEmail"] as const;
const PROFILE_FIELDS = ["name", "role", "bio", "active"] as const;
const ROLE_FIELD = "accessRole";

const patchSchema = z
  .object({
    instagramHandle: z.string().max(100).nullable().optional(),
    facebookHandle: z.string().max(100).nullable().optional(),
    personalPhone: z.string().max(32).nullable().optional(),
    personalEmail: z.string().email().max(200).nullable().or(z.literal("")).optional(),
    name: z.string().min(1).max(200).optional(),
    role: z.string().min(1).max(100).optional(),
    bio: z.string().max(1000).nullable().optional(),
    active: z.boolean().optional(),
    accessRole: z.enum(["stylist", "manager", "dev"]).optional(),
  })
  .strict();

/**
 * Edits a stylist's profile. Three independent permission rules in one route
 * (mixing field kinds in one request is rejected, so a caller always knows
 * exactly what took effect):
 *  - Contact fields (instagram/facebook/phone/email) — the row's own owner
 *    can always edit their own, from their own availability page. A dev can
 *    edit anyone's (e.g. to fix a typo on someone's behalf). A manager
 *    cannot edit anyone else's contact fields — self-service only.
 *  - Profile fields (name/job-title/bio/active) — dev only, on anyone.
 *  - accessRole (promote/demote between stylist/owner/dev) — dev only, and
 *    never on their own row (no accidental self-demotion/lockout).
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  const { id } = await context.params;

  const [target] = await db.select().from(stylists).where(eq(stylists.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }
  const isSelf = target.id === me.id;

  // A manager can't even see a dev-role row (hidden from GET /api/admin/stylists),
  // but re-check here defensively against a guessed id.
  if (target.accessRole === "dev" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const keys = Object.keys(parsed.data);
  const touchesContact = keys.some((k) => (CONTACT_FIELDS as readonly string[]).includes(k));
  const touchesProfile = keys.some((k) => (PROFILE_FIELDS as readonly string[]).includes(k));
  const touchesRole = keys.includes(ROLE_FIELD);

  if ([touchesContact, touchesProfile, touchesRole].filter(Boolean).length > 1) {
    return NextResponse.json(
      { error: "Contact info, profile details, and access role must be updated separately" },
      { status: 400 },
    );
  }

  if (touchesRole) {
    if (me.accessRole !== "dev") {
      return NextResponse.json({ error: "Only the developer account can change access roles" }, { status: 403 });
    }
    if (isSelf) {
      return NextResponse.json({ error: "You can't change your own access role" }, { status: 400 });
    }
  }
  if (touchesProfile && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Only the developer account can edit profile details" }, { status: 403 });
  }
  if (touchesContact && !isSelf && me.accessRole !== "dev") {
    return NextResponse.json({ error: "You can only edit your own contact info" }, { status: 403 });
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (update.personalEmail === "") update.personalEmail = null;

  await db.update(stylists).set(update).where(eq(stylists.id, id));
  const [updated] = await db.select().from(stylists).where(eq(stylists.id, id)).limit(1);
  return NextResponse.json({ stylist: updated });
}

/**
 * Removes a staff account. Owner (Reyna) or dev (Aidenn) only, never on
 * their own row, and a manager can't reach a dev row (same defensive
 * re-check as PATCH, on top of being hidden from the list entirely).
 *
 * Revokes Supabase Auth access immediately either way. If the stylist has
 * appointment history, the row itself is kept (deactivated, unlinked from
 * auth) rather than hard-deleted, since appointments reference it — deleting
 * past booking records isn't this action's job. A stylist with no
 * appointment history is removed outright.
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "manager" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const [target] = await db.select().from(stylists).where(eq(stylists.id, id)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }
  if (target.id === me.id) {
    return NextResponse.json({ error: "You can't remove your own account" }, { status: 400 });
  }
  if (target.accessRole === "dev" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  if (target.authUserId) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.auth.admin.deleteUser(target.authUserId);
    if (error && !error.message.toLowerCase().includes("not found")) {
      return NextResponse.json({ error: "Failed to revoke that account's login" }, { status: 500 });
    }
  }

  try {
    await db.delete(stylists).where(eq(stylists.id, id));
    return NextResponse.json({ ok: true, removed: true });
  } catch {
    // Foreign-key restriction from existing appointments — keep the row for
    // booking-history integrity, but fully revoke access.
    await db.update(stylists).set({ active: false, authUserId: null }).where(eq(stylists.id, id));
    return NextResponse.json({ ok: true, removed: false, deactivated: true });
  }
}
