import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stylists } from "@/lib/db/schema";

export async function GET() {
  const rows = await db
    .select({
      id: stylists.id,
      slug: stylists.slug,
      name: stylists.name,
      role: stylists.role,
      bio: stylists.bio,
      instagramHandle: stylists.instagramHandle,
      facebookHandle: stylists.facebookHandle,
      personalPhone: stylists.personalPhone,
      personalEmail: stylists.personalEmail,
    })
    .from(stylists)
    .where(eq(stylists.active, true));
  return NextResponse.json({ stylists: rows });
}
