import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appointmentEvents } from "@/lib/db/schema";
import { getCurrentStylist, isDev } from "@/lib/currentStylist";

/**
 * Dev-only read of the appointment audit trail — who created/confirmed/
 * cancelled/rescheduled which appointment, and when. Not exposed to
 * managers or stylists, matching what was asked for (Aidenn specifically).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentStylist();
  if (!me || !isDev(me)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const actorStylistId = searchParams.get("actorStylistId");
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

  const rows = await db
    .select()
    .from(appointmentEvents)
    .where(actorStylistId ? eq(appointmentEvents.actorStylistId, actorStylistId) : undefined)
    .orderBy(desc(appointmentEvents.createdAt))
    .limit(limit);

  return NextResponse.json({ events: rows });
}
