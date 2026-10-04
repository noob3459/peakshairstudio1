// Apple Valley, CA observes US Pacific time (America/Los_Angeles), including DST.
export const SALON_TIMEZONE = "America/Los_Angeles";

type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 (Sun) - 6 (Sat)
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Reads a UTC instant as wall-clock parts in the given IANA time zone. */
export function getZonedParts(instant: Date, timeZone: string = SALON_TIMEZONE): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

/**
 * Converts a local wall-clock date + minute-of-day (in the salon's time zone)
 * into the correct UTC instant, handling DST correctly via the standard
 * "guess, then correct by the observed offset" technique.
 */
export function zonedDateMinutesToUtc(
  dateStr: string, // YYYY-MM-DD
  minuteOfDay: number,
  timeZone: string = SALON_TIMEZONE,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(guess)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const driftMs = guess.getTime() - asIfUtc;
  return new Date(guess.getTime() + driftMs);
}

export function todayLocalDateStr(timeZone: string = SALON_TIMEZONE): string {
  const p = getZonedParts(new Date(), timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatLocalTime(instant: Date, timeZone: string = SALON_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

export function formatLocalDate(instant: Date, timeZone: string = SALON_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(instant);
}
