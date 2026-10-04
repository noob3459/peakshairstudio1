import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { proposedChanges, stylists } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";

/**
 * A suggestion inbox, not a CMS: Reyna (manager) proposes copy/content
 * changes here; Aidenn (dev) reviews and applies them by hand elsewhere.
 * Nothing in this table ever writes to the public site automatically.
 */
export async function GET() {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole === "stylist") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: proposedChanges.id,
      page: proposedChanges.page,
      content: proposedChanges.content,
      status: proposedChanges.status,
      createdAt: proposedChanges.createdAt,
      resolvedAt: proposedChanges.resolvedAt,
      submittedByName: stylists.name,
      submittedByStylistId: proposedChanges.submittedByStylistId,
    })
    .from(proposedChanges)
    .innerJoin(stylists, eq(proposedChanges.submittedByStylistId, stylists.id))
    .where(me.accessRole === "dev" ? undefined : eq(proposedChanges.submittedByStylistId, me.id))
    .orderBy(asc(proposedChanges.status), desc(proposedChanges.createdAt));

  return NextResponse.json({ proposals: rows });
}

const PAGE_OPTIONS = ["home", "services", "team", "story", "grand-opening", "join-the-team", "visit", "other"] as const;

const createSchema = z.object({
  page: z.enum(PAGE_OPTIONS),
  content: z.string().trim().min(1, "Describe the change you'd like").max(4000),
});

/** Only a manager (Reyna) can propose changes — a dev edits directly, a stylist has no reason to. */
export async function POST(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "manager") {
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

  const id = crypto.randomUUID();
  await db.insert(proposedChanges).values({
    id,
    submittedByStylistId: me.id,
    page: parsed.data.page,
    content: parsed.data.content,
  });

  return NextResponse.json({ ok: true, id });
}
