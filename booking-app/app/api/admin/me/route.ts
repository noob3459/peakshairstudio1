import { NextResponse } from "next/server";
import { getCurrentStylist } from "@/lib/currentStylist";

export async function GET() {
  const stylist = await getCurrentStylist();
  if (!stylist) {
    return NextResponse.json({ error: "No stylist profile linked to this account" }, { status: 404 });
  }
  return NextResponse.json({
    id: stylist.id,
    slug: stylist.slug,
    name: stylist.name,
    role: stylist.role,
    accessRole: stylist.accessRole,
  });
}
