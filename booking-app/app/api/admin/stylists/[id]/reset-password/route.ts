import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Resets another staff member's password and returns the new one once (the
 * caller is expected to relay it securely, same as scripts/create-staff-admins.ts).
 * Dev can reset anyone's. Manager can reset any non-dev account's, but not
 * her own via this route (nothing stops her signing out and using the
 * normal flow, but there's no self-reset button — keeps this route's one
 * job simple: resetting *someone else's* forgotten password).
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "dev" && me.accessRole !== "manager") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  const [target] = await db.select().from(stylists).where(eq(stylists.id, id)).limit(1);
  if (!target || !target.authUserId) {
    return NextResponse.json({ error: "Stylist account not found" }, { status: 404 });
  }
  if (target.accessRole === "dev" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const password = generatePassword();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(target.authUserId, { password });
  if (error) {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  return NextResponse.json({ password });
}
