import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services } from "@/lib/db/schema";

export async function GET() {
  const rows = await db.select().from(services).where(eq(services.active, true));
  return NextResponse.json({ services: rows });
}
