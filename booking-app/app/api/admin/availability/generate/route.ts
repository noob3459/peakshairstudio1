import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { availabilityDays } from "@/lib/db/schema";
import { getCurrentStylist, resolveTargetStylist } from "@/lib/currentStylist";
import { todayLocalDateStr } from "@/lib/timezone";

const MAX_DAYS_AHEAD = 365;

const generateSchema = z.object({
  stylistId: z.string().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
  weeks: z.number().int().min(1).max(52),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Bulk-writes availability_days rows: every date matching one of `weekdays`
 * from `startDate` (default today) through `weeks` weeks later, each opened
 * with the given start/end window. This is the only way a stylist's
 * confirmed availability extends more than one day at a time, and even then
 * it's bounded to exactly the weeks requested — nothing beyond that is ever
 * implicitly bookable. Overwrites any existing row for a matching date,
 * since running the generator is itself the explicit, intentional action.
 */
export async function POST(req: NextRequest) {
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
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { stylistId, weekdays, startMinute, endMinute, weeks, startDate } = parsed.data;

  if (endMinute <= startMinute) {
    return NextResponse.json({ error: "endMinute must be after startMinute" }, { status: 400 });
  }

  const target = await resolveTargetStylist(me, stylistId);
  if (!target) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  const today = todayLocalDateStr();
  const from = startDate && startDate > today ? startDate : today;
  const weekdaySet = new Set(weekdays);

  const horizon = addDays(today, MAX_DAYS_AHEAD);
  const totalDays = Math.min(weeks * 7, MAX_DAYS_AHEAD);

  const dates: string[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(from, i);
    if (date > horizon) break;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekdaySet.has(weekday)) dates.push(date);
  }

  if (dates.length === 0) {
    return NextResponse.json({ ok: true, count: 0 });
  }

  const existing = await db
    .select({ id: availabilityDays.id, date: availabilityDays.date })
    .from(availabilityDays)
    .where(
      and(
        eq(availabilityDays.stylistId, target.id),
        gte(availabilityDays.date, dates[0]),
        lte(availabilityDays.date, dates[dates.length - 1]),
      ),
    );
  const existingByDate = new Map(existing.map((r) => [r.date, r.id]));

  await db.transaction(async (tx) => {
    for (const date of dates) {
      const existingId = existingByDate.get(date);
      if (existingId) {
        await tx
          .update(availabilityDays)
          .set({ isClosed: false, startMinute, endMinute, note: null })
          .where(eq(availabilityDays.id, existingId));
      } else {
        await tx.insert(availabilityDays).values({
          id: crypto.randomUUID(),
          stylistId: target.id,
          date,
          isClosed: false,
          startMinute,
          endMinute,
        });
      }
    }
  });

  return NextResponse.json({ ok: true, count: dates.length });
}
