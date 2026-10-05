import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lt, ne, lte } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { appointmentEvents, appointments, services, stylists } from "@/lib/db/schema";
import { canActAcrossStylists, getCurrentStylist, resolveTargetStylist } from "@/lib/currentStylist";
import { formatLocalDate, formatLocalTime, zonedDateMinutesToUtc } from "@/lib/timezone";
import { sendBookingEmails } from "@/lib/email";
import { isUniqueViolation } from "@/lib/db/errors";

/**
 * Lists appointments. A plain stylist only ever gets their own — a manager
 * (Reyna) or dev (Aidenn) gets everyone's, matching the Users page's same
 * canActAcrossStylists split.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from"); // ISO instant, inclusive
  const to = searchParams.get("to"); // ISO instant, exclusive

  const conditions = [];
  if (from) conditions.push(gte(appointments.startAt, from));
  if (to) conditions.push(lte(appointments.startAt, to));
  if (!canActAcrossStylists(me)) conditions.push(eq(appointments.stylistId, me.id));

  const rows = await db
    .select({
      id: appointments.id,
      confirmationCode: appointments.confirmationCode,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      clientName: appointments.clientName,
      clientEmail: appointments.clientEmail,
      clientPhone: appointments.clientPhone,
      notes: appointments.notes,
      serviceName: services.name,
      serviceId: services.id,
      stylistName: stylists.name,
      stylistId: stylists.id,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(stylists, eq(appointments.stylistId, stylists.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(appointments.startAt));

  return NextResponse.json({ appointments: rows });
}

function generateConfirmationCode(): string {
  // Alphabet deliberately skips 0/O and 1/I so codes read unambiguously out loud.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const adminCreateSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required").max(200),
  clientEmail: z.string().trim().email("Enter a valid email"),
  clientPhone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(32)
    .regex(/^[0-9()+\-. ]+$/, "Enter a valid phone number"),
  serviceId: z.string().min(1, "Pick a service"),
  stylistId: z.string().min(1, "Pick a stylist"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  startMinute: z.number().int().min(0).max(1439).default(9 * 60),
  durationMinutes: z.number().int().min(15).max(600).default(60),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
  notes: z.string().trim().max(500).optional(),
  marketingOptIn: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = adminCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form for errors", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const stylist = await resolveTargetStylist(me, input.stylistId);
  if (!stylist) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  const [service] = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const startAt = zonedDateMinutesToUtc(input.date, input.startMinute);
  const endAt = new Date(startAt.getTime() + input.durationMinutes * 60_000);

  // Manual creation intentionally bypasses the stylist's availability rules
  // (the owner books outside the regular schedule), but two live
  // (pending or confirmed) appointments for the same stylist must never
  // overlap in time.
  const [conflict] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.stylistId, stylist.id),
        ne(appointments.status, "cancelled"),
        lt(appointments.startAt, endAt.toISOString()),
        gte(appointments.endAt, startAt.toISOString()),
      ),
    )
    .limit(1);
  if (conflict) {
    return NextResponse.json(
      { error: `${stylist.name} already has an appointment that overlaps this time. Pick a different slot.` },
      { status: 409 },
    );
  }

  const id = randomUUID();
  const confirmationCode = generateConfirmationCode();

  try {
    await db.insert(appointments).values({
      id,
      confirmationCode,
      serviceId: service.id,
      stylistId: stylist.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      notes: input.notes || null,
      marketingOptIn: input.marketingOptIn,
      status: input.status,
    });
    await db.insert(appointmentEvents).values({
      id: randomUUID(),
      appointmentId: id,
      action: "created",
      actorStylistId: me.id,
      actorName: me.name,
      clientName: input.clientName,
      serviceName: service.name,
      stylistName: stylist.name,
      startAt: startAt.toISOString(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: `${stylist.name} already has an appointment at exactly this time.` },
        { status: 409 },
      );
    }
    console.error("Failed to create appointment via admin", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Pending appointments get their confirmation emails when someone confirms
  // them later — same flow as public bookings.
  const emailResult =
    input.status === "confirmed"
      ? await sendBookingEmails({
          appointmentId: id,
          confirmationCode,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
          serviceName: service.name,
          stylistName: stylist.name,
          localDateLabel: formatLocalDate(startAt),
          localTimeLabel: formatLocalTime(startAt),
          notes: input.notes,
        })
      : { clientSent: false, salonSent: false };

  return NextResponse.json(
    {
      appointment: {
        id,
        confirmationCode,
        clientName: input.clientName,
        serviceName: service.name,
        stylistName: stylist.name,
        localDateLabel: formatLocalDate(startAt),
        localTimeLabel: formatLocalTime(startAt),
        status: input.status,
      },
      emailSent: emailResult.clientSent,
    },
    { status: 201 },
  );
}
