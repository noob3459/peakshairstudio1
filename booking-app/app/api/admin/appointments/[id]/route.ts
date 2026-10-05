import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { appointmentEvents, appointments, services, stylists } from "@/lib/db/schema";
import { canActAcrossStylists, getCurrentStylist } from "@/lib/currentStylist";
import { formatLocalDate, formatLocalTime } from "@/lib/timezone";
import { sendAppointmentUpdateEmail } from "@/lib/email";
import { isUniqueViolation } from "@/lib/db/errors";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("reschedule"),
    startAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid start time"),
  }),
]);

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const me = await getCurrentStylist();
  if (!me) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
    return NextResponse.json({ error: "Invalid action", issues: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select({
      id: appointments.id,
      confirmationCode: appointments.confirmationCode,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      clientName: appointments.clientName,
      clientEmail: appointments.clientEmail,
      serviceId: appointments.serviceId,
      stylistId: appointments.stylistId,
      serviceName: services.name,
      stylistName: stylists.name,
      durationMinutes: services.durationMinutes,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(stylists, eq(appointments.stylistId, stylists.id))
    .where(eq(appointments.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (existing.stylistId !== me.id && !canActAcrossStylists(me)) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const action = parsed.data.action;

  if (action === "confirm") {
    await db.update(appointments).set({ status: "confirmed" }).where(eq(appointments.id, id));
  } else if (action === "cancel") {
    await db.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, id));
  } else if (action === "reschedule") {
    const newStart = new Date(parsed.data.startAt);
    const durationMinutes = existing.durationMinutes ?? 60;
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60_000);
    try {
      await db
        .update(appointments)
        .set({ startAt: newStart.toISOString(), endAt: newEnd.toISOString() })
        .where(eq(appointments.id, id));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: "That stylist already has an appointment at the new time" },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  const effectiveStart = action === "reschedule" ? new Date(parsed.data.startAt) : new Date(existing.startAt);
  const emailAction = action === "confirm" ? "confirmed" : action === "cancel" ? "cancelled" : "rescheduled";

  await db.insert(appointmentEvents).values({
    id: randomUUID(),
    appointmentId: existing.id,
    action: emailAction,
    actorStylistId: me.id,
    actorName: me.name,
    clientName: existing.clientName,
    serviceName: existing.serviceName,
    stylistName: existing.stylistName,
    startAt: effectiveStart.toISOString(),
    previousStartAt: action === "reschedule" ? existing.startAt : null,
  });

  await sendAppointmentUpdateEmail({
    appointmentId: existing.id,
    confirmationCode: existing.confirmationCode,
    clientEmail: existing.clientEmail,
    clientName: existing.clientName,
    serviceName: existing.serviceName,
    stylistName: existing.stylistName,
    localDateLabel: formatLocalDate(effectiveStart),
    localTimeLabel: formatLocalTime(effectiveStart),
    action: emailAction,
  });

  return NextResponse.json({ ok: true });
}
