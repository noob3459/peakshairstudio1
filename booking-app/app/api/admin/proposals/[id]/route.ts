import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { proposedChanges } from "@/lib/db/schema";
import { getCurrentStylist } from "@/lib/currentStylist";

const patchSchema = z.object({ status: z.enum(["open", "resolved"]) });

/** Dev marks a proposal reviewed/applied (or reopens it). */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  if (me.accessRole !== "dev") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await db
    .update(proposedChanges)
    .set({
      status: parsed.data.status,
      resolvedAt: parsed.data.status === "resolved" ? sql`now()` : null,
    })
    .where(eq(proposedChanges.id, id));

  return NextResponse.json({ ok: true });
}

/** The submitter can retract their own still-open proposal; dev can remove any. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  const { id } = await context.params;

  const [existing] = await db.select().from(proposedChanges).where(eq(proposedChanges.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwnOpenProposal = existing.submittedByStylistId === me.id && existing.status === "open";
  if (me.accessRole !== "dev" && !isOwnOpenProposal) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  await db.delete(proposedChanges).where(eq(proposedChanges.id, id));
  return NextResponse.json({ ok: true });
}
