import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generatePassword, passwordSchema, PASSWORD_ERROR } from "@/lib/password";

const bodySchema = z.object({ password: passwordSchema.optional() });

/**
 * Resets another staff member's password and returns the new one once (the
 * caller is expected to relay it securely, same as scripts/create-staff-admins.ts).
 * With no body (or an empty one) a random password is generated, same as
 * before. An optional `password` in the body sets that exact password
 * instead — lets Reyna or Aidenn choose one directly rather than relaying a
 * generated string.
 * Dev can reset anyone's. Manager can reset any non-dev account's, but not
 * her own via this route (nothing stops her signing out and using the
 * normal flow, but there's no self-reset button — keeps this route's one
 * job simple: resetting *someone else's* forgotten password).
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "dev" && me.accessRole !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: unknown = {};
  const raw = await req.text();
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: PASSWORD_ERROR }, { status: 400 });
  }

  const { id } = await context.params;
  const [target] = await db.select().from(stylists).where(eq(stylists.id, id)).limit(1);
  if (!target || !target.authUserId) {
    return NextResponse.json({ error: "Stylist account not found" }, { status: 404 });
  }
  if (target.accessRole === "dev" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const password = parsed.data.password ?? generatePassword();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(target.authUserId, { password });
  if (error) {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  return NextResponse.json({ password });
}
