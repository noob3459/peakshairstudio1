import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { availabilityDays, stylists } from "@/lib/db/schema";
import { getCurrentStylist, resolveTargetStylist } from "@/lib/currentStylist";
import { todayLocalDateStr } from "@/lib/timezone";

const MAX_DAYS_AHEAD = 365;

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Scoped to "my own profile" by default. A manager/dev may pass ?stylistId=
 * to view/edit someone else's — resolveTargetStylist() is what actually
 * enforces that (a plain stylist's request for another id is silently
 * forced back to their own; a manager can't reach a dev's row). Never trust
 * accessRole or stylistId beyond what that function resolves.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  const requestedId = req.nextUrl.searchParams.get("stylistId");
  const target = await resolveTargetStylist(me, requestedId);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  const today = todayLocalDateStr();
  const from = req.nextUrl.searchParams.get("from") || today;
  const to = req.nextUrl.searchParams.get("to") || addDays(today, MAX_DAYS_AHEAD);

  const days = await db
    .select()
    .from(availabilityDays)
    .where(
      and(eq(availabilityDays.stylistId, target.id), gte(availabilityDays.date, from), lte(availabilityDays.date, to)),
    )
    .orderBy(asc(availabilityDays.date));

  return NextResponse.json({
    stylist: { ...target, days },
    isOwnProfile: target.id === me.id,
  });
}

const upsertSchema = z.object({
  stylistId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  isClosed: z.boolean(),
  startMinute: z.number().int().min(0).max(1440).optional(),
  endMinute: z.number().int().min(0).max(1440).optional(),
  note: z.string().max(200).optional(),
});

/** Upserts one exact date's availability for a stylist (self, or another if manager/dev). */
export async function PUT(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { stylistId, date, isClosed, startMinute, endMinute, note } = parsed.data;

  const target = await resolveTargetStylist(me, stylistId);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  if (!isClosed && (startMinute == null || endMinute == null || endMinute <= startMinute)) {
    return NextResponse.json(
      { error: "Available days need a startMinute and a later endMinute" },
      { status: 400 },
    );
  }

  const [row] = await db
    .select()
    .from(availabilityDays)
    .where(and(eq(availabilityDays.stylistId, target.id), eq(availabilityDays.date, date)))
    .limit(1);

  const values = {
    isClosed,
    startMinute: isClosed ? null : startMinute!,
    endMinute: isClosed ? null : endMinute!,
    note: note || null,
  };

  if (row) {
    await db.update(availabilityDays).set(values).where(eq(availabilityDays.id, row.id));
  } else {
    await db.insert(availabilityDays).values({ id: crypto.randomUUID(), stylistId: target.id, date, ...values });
  }

  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({
  stylistId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

/** Fully unsets one date (distinct from marking it closed) for a stylist (self, or another if manager/dev). */
export async function DELETE(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const target = await resolveTargetStylist(me, parsed.data.stylistId);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  await db
    .delete(availabilityDays)
    .where(and(eq(availabilityDays.stylistId, target.id), eq(availabilityDays.date, parsed.data.date)));

  return NextResponse.json({ ok: true });
}

const bufferSchema = z.object({
  stylistId: z.string().optional(),
  bufferMinutes: z.number().int().min(0).max(240),
});

/** Updates a stylist's (self, or another if manager/dev) buffer time between appointments. */
export async function PATCH(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = bufferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const target = await resolveTargetStylist(me, parsed.data.stylistId);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  await db.update(stylists).set({ bufferMinutes: parsed.data.bufferMinutes }).where(eq(stylists.id, target.id));
  return NextResponse.json({ ok: true });
}
