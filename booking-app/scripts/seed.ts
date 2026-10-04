/**
 * Seeds the database with the salon's real, confirmed stylists and services.
 * No real client data, no secrets.
 *
 * Service durations/prices are left null on purpose — the brief says not to
 * invent them. No availability is seeded either, and deliberately so: a
 * stylist is only bookable on dates they've explicitly set via
 * /staff/availability (calendar picker or the weeks-ahead generator) —
 * seeding placeholder hours here would look exactly like a stylist's own
 * confirmation, which defeats the point.
 *
 * Usage: npx tsx scripts/seed.ts
 */
import { randomUUID } from "node:crypto";
import { db } from "../lib/db/client";
import { services, stylists } from "../lib/db/schema";

async function main() {
  const reyna = {
    id: randomUUID(),
    slug: "reyna",
    name: "Reyna Barnes",
    role: "Owner & Stylist",
    bio: "19 years behind the chair. Specializes in blondes and vivids.",
    instagramHandle: "hair_by_reyna",
  };
  const isabel = {
    id: randomUUID(),
    slug: "isabel",
    name: "Isabel",
    role: "Stylist",
    bio: "7 years of experience. Blowout specialist.",
    instagramHandle: null,
  };
  const brandon = {
    id: randomUUID(),
    slug: "brandon",
    name: "Brandon",
    role: "Stylist",
    bio: "31 years of experience. Cuts, color, and blowouts.",
    instagramHandle: null,
  };

  await db.insert(stylists).values([reyna, isabel, brandon]);

  await db.insert(services).values([
    { id: randomUUID(), slug: "haircut", name: "Haircut", description: null },
    { id: randomUUID(), slug: "blonding", name: "Blonding", description: null },
    { id: randomUUID(), slug: "lived-in-color", name: "Lived-In Color", description: null },
    { id: randomUUID(), slug: "extensions", name: "Extensions", description: null },
    { id: randomUUID(), slug: "blowout", name: "Blowout", description: null },
    {
      id: randomUUID(),
      slug: "consultation",
      name: "Additional Services",
      description: "By consultation",
    },
  ]);

  console.log("Seeded 3 stylists and 6 services.");
  console.log(
    "No hours are seeded — each stylist sets their own at /staff/availability (pick dates on " +
      "the calendar, or generate a recurring pattern for the next few weeks) before they're " +
      "bookable at all.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
