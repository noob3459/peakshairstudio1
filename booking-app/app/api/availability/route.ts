import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";
import { getOpenSlots } from "@/lib/availability";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date");
  const stylistId = searchParams.get("stylistId"); // omit or "any" = no preference

  if (!serviceId || !date) {
    return NextResponse.json({ error: "serviceId and date are required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  if (stylistId && stylistId !== "any") {
    const slots = await getOpenSlots(stylistId, serviceId, date);
    return NextResponse.json({ slots: slots.map((s) => ({ ...s, stylistId })) });
  }

  // "No preference": union across every active stylist, each slot tagged with who it's with.
  const activeStylists = await db.select().from(stylists).where(eq(stylists.active, true));
  const results = await Promise.all(
    activeStylists.map(async (s) => {
      const slots = await getOpenSlots(s.id, serviceId, date);
      return slots.map((slot) => ({ ...slot, stylistId: s.id, stylistName: s.name }));
    }),
  );
  const merged = results.flat().sort((a, b) => a.startAt.localeCompare(b.startAt));
  return NextResponse.json({ slots: merged });
}
