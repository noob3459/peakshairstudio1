import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db } from "./db/client";
import { appointments, availabilityDays, services, stylists } from "./db/schema";
import { zonedDateMinutesToUtc } from "./timezone";

const SLOT_STEP_MINUTES = 15;
const DEFAULT_SERVICE_DURATION_MINUTES = 60; // only used to compute slots when a service's
// own duration hasn't been configured yet; the booking UI still labels the service's
// price/duration as "Contact the salon to confirm" rather than showing this number.

export type Slot = { startAt: string; endAt: string; label: string };

/**
 * Returns bookable start times for one stylist, one service, one local calendar
 * date — after applying that date's confirmed availability (no row = not
 * bookable, by design; see lib/db/schema.ts's availabilityDays), existing
 * appointments, and the stylist's buffer time.
 */
export async function getOpenSlots(
  stylistId: string,
  serviceId: string,
  dateStr: string,
): Promise<Slot[]> {
  const [stylist] = await db.select().from(stylists).where(eq(stylists.id, stylistId)).limit(1);
  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!stylist || !stylist.active || !service || !service.active) return [];

  const durationMinutes = service.durationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES;
  const buffer = stylist.bufferMinutes ?? 0;

  const [day] = await db
    .select()
    .from(availabilityDays)
    .where(and(eq(availabilityDays.stylistId, stylistId), eq(availabilityDays.date, dateStr)))
    .limit(1);

  if (!day || day.isClosed) return [];
  const windowStart = day.startMinute;
  const windowEnd = day.endMinute;

  if (windowStart == null || windowEnd == null || windowEnd <= windowStart) return [];

  const dayStartUtc = zonedDateMinutesToUtc(dateStr, 0);
  const dayEndUtc = zonedDateMinutesToUtc(dateStr, 24 * 60);

  const busy = await db
    .select({ startAt: appointments.startAt, endAt: appointments.endAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.stylistId, stylistId),
        ne(appointments.status, "cancelled"),
        gte(appointments.startAt, dayStartUtc.toISOString()),
        lte(appointments.startAt, dayEndUtc.toISOString()),
      ),
    );

  const busyRanges = busy.map((b) => ({
    start: new Date(b.startAt).getTime() - buffer * 60_000,
    end: new Date(b.endAt).getTime() + buffer * 60_000,
  }));

  const slots: Slot[] = [];
  const now = Date.now();

  for (let m = windowStart; m + durationMinutes <= windowEnd; m += SLOT_STEP_MINUTES) {
    const startUtc = zonedDateMinutesToUtc(dateStr, m);
    const endUtc = zonedDateMinutesToUtc(dateStr, m + durationMinutes);

    if (startUtc.getTime() <= now) continue; // no past slots

    const overlaps = busyRanges.some(
      (b) => startUtc.getTime() < b.end && endUtc.getTime() > b.start,
    );
    if (overlaps) continue;

    slots.push({
      startAt: startUtc.toISOString(),
      endAt: endUtc.toISOString(),
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "2-digit",
      }).format(startUtc),
    });
  }

  return slots;
}
