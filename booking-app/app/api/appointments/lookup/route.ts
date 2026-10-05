import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { appointmentEvents, appointments, services, stylists } from "@/lib/db/schema";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const lookupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().min(7).max(32).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Enter an email or phone number" });

/**
 * Public, unauthenticated lookup by the client's own email/phone — no login
 * exists for clients. Returns every appointment on file for that contact
 * (future and past, any status), plus who booked it: the client themself
 * (self-booked via /book) or a staff member by name, sourced from the
 * appointment_events audit trail's "created" row. Appointments made before
 * that trail existed have no such row — bookedBy is null in that case, and
 * the client UI says so plainly rather than guessing.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`lookup:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many lookups — please try again in a few minutes." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email or phone number" }, { status: 400 });
  }
  const { email, phone } = parsed.data;
  const phoneDigits = phone?.replace(/\D/g, "");

  const conditions = [];
  if (email) conditions.push(eq(sql`lower(${appointments.clientEmail})`, email));
  if (phoneDigits)
    conditions.push(eq(sql`regexp_replace(${appointments.clientPhone}, '\\D', '', 'g')`, phoneDigits));

  if (conditions.length === 0) {
    return NextResponse.json({ error: "Enter a valid email or phone number" }, { status: 400 });
  }

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
      servicePriceCents: services.priceCents,
      stylistName: stylists.name,
      // actorName is always a real label when a "created" event exists —
      // either "Client (self-booked)" or a staff member's name — so a plain
      // null here (left join found nothing) unambiguously means "no record"
      // for appointments made before this audit trail existed.
      bookedByName: appointmentEvents.actorName,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(stylists, eq(appointments.stylistId, stylists.id))
    .leftJoin(
      appointmentEvents,
      and(eq(appointmentEvents.appointmentId, appointments.id), eq(appointmentEvents.action, "created")),
    )
    .where(or(...conditions))
    .orderBy(asc(appointments.startAt));

  return NextResponse.json({ appointments: rows });
}
