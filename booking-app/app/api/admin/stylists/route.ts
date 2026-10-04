import { NextRequest, NextResponse } from "next/server";
import { asc, eq, ne } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUsernameFormat, usernameToSyntheticEmail } from "@/lib/staffAccounts";

/**
 * Lists staff accounts. A plain stylist gets just themselves. A manager
 * (Reyna) gets everyone except dev accounts — she should not see Aidenn as
 * a user at all. A dev (Aidenn) gets everyone. Used by both the Users page
 * and the availability page's "view someone else's schedule" switcher
 * (which further filters to active=true, bookable stylists, client-side).
 */
export async function GET() {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }

  if (me.accessRole === "stylist") {
    return NextResponse.json({ stylists: [me] });
  }

  const rows =
    me.accessRole === "dev"
      ? await db.select().from(stylists).orderBy(asc(stylists.name))
      : await db.select().from(stylists).where(ne(stylists.accessRole, "dev")).orderBy(asc(stylists.name));

  return NextResponse.json({ stylists: rows });
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*";
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const createSchema = z.object({
  username: z.string().min(2).max(30),
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(100),
});

/**
 * Adds a new staff account: owner (Reyna) or dev (Aidenn) only. Creates both
 * the Supabase Auth user (random password, returned once — same pattern as
 * the reset-password route) and the linked stylists row, as a new "stylist"
 * (lowest access level; the dev account can elevate it afterward via PATCH).
 */
export async function POST(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "manager" && me.accessRole !== "dev") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const username = parsed.data.username.trim().toLowerCase();
  if (!isValidUsernameFormat(username)) {
    return NextResponse.json(
      { error: "Username must start with a letter and contain only lowercase letters/numbers" },
      { status: 400 },
    );
  }

  const [existingSlug] = await db.select().from(stylists).where(eq(stylists.slug, username)).limit(1);
  if (existingSlug) {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }

  const email = usernameToSyntheticEmail(username)!;
  const password = generatePassword();
  const supabase = createSupabaseAdminClient();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message ?? "Failed to create the account" }, { status: 500 });
  }

  const id = randomUUID();
  await db.insert(stylists).values({
    id,
    slug: username,
    name: parsed.data.name,
    role: parsed.data.role,
    active: true,
    accessRole: "stylist",
    authUserId: created.user.id,
  });

  return NextResponse.json({ id, username, password });
}
