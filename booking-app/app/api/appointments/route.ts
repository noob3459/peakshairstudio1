import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appointments, services, stylists } from "@/lib/db/schema";
import { createAppointmentSchema } from "@/lib/validation";
import { formatLocalDate, formatLocalTime } from "@/lib/timezone";
import { sendBookingEmails } from "@/lib/email";
import { isUniqueViolation } from "@/lib/db/errors";

function generateConfirmationCode(): string {
  // 6 chars, unambiguous alphabet (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the form for errors", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const [service] = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
  const [stylist] = await db.select().from(stylists).where(eq(stylists.id, input.stylistId)).limit(1);
  if (!service || !service.active || !stylist || !stylist.active) {
    return NextResponse.json({ error: "That service or stylist is no longer available" }, { status: 409 });
  }

  const durationMinutes = service.durationMinutes ?? 60;
  const startAt = new Date(input.startAt);
  if (startAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "That time has already passed" }, { status: 409 });
  }
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  const id = randomUUID();
  const confirmationCode = generateConfirmationCode();

  try {
    // The UNIQUE(stylist_id, start_at) index is the real double-booking guard:
    // even if two requests race past the availability check above at nearly
    // the same instant, only one INSERT can succeed for the same slot.
    await db.insert(appointments).values({
      id,
      confirmationCode,
      serviceId: input.serviceId,
      stylistId: input.stylistId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      notes: input.notes || null,
      marketingOptIn: input.marketingOptIn ?? false,
      status: "confirmed",
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "That slot was just booked by someone else. Please pick another time." },
        { status: 409 },
      );
    }
    console.error("Failed to create appointment", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const localDateLabel = formatLocalDate(startAt);
  const localTimeLabel = formatLocalTime(startAt);

  const emailResult = await sendBookingEmails({
    appointmentId: id,
    confirmationCode,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    serviceName: service.name,
    stylistName: stylist.name,
    localDateLabel,
    localTimeLabel,
    notes: input.notes,
  });

  return NextResponse.json({
    appointment: {
      id,
      confirmationCode,
      serviceName: service.name,
      stylistName: stylist.name,
      localDateLabel,
      localTimeLabel,
    },
    emailSent: emailResult.clientSent,
  });
}
