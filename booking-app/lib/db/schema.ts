import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Database is Supabase Postgres, reached via Drizzle ORM (postgres-js dialect)
 * over DATABASE_URL — see booking-app/README.md. RLS is enabled on every table
 * in the matching supabase/migrations SQL (defense-in-depth); the real
 * authorization boundary is this app's own API routes + middleware, since
 * these tables are only ever reached through them, never directly from the
 * browser.
 */

export const stylists = pgTable("stylists", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  bio: text("bio"),
  instagramHandle: text("instagram_handle"),
  // Self-service contact fields — each stylist edits only their own, via
  // their own availability page. Reflected on the public team page.
  facebookHandle: text("facebook_handle"),
  personalPhone: text("personal_phone"),
  personalEmail: text("personal_email"),
  active: boolean("active").notNull().default(true),
  // Minutes of gap the owner wants held after each appointment before the next can start.
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  // Links this stylist row to their own Supabase Auth account (one admin login
  // per stylist/staff member). Null until scripts/create-staff-admins.ts
  // provisions them. This is the server-side authorization key — every
  // /api/admin/* route resolves "who am I" from this via lib/currentStylist.ts.
  authUserId: text("auth_user_id").unique(),
  // Access level for the admin area:
  //  - "stylist": own availability + own contact info only (Isabel, Brandon)
  //  - "manager": all stylists' availability, user password resets, can
  //    submit site-change proposals but not apply them (Reyna)
  //  - "dev": everything, including reviewing/exporting proposals and
  //    resetting anyone's password (Aidenn — the actual site developer)
  // Aidenn has a row here too (for the same auth-linking mechanism) but with
  // active=false, since he isn't a bookable hair stylist.
  accessRole: text("access_role", { enum: ["stylist", "manager", "dev"] })
    .notNull()
    .default("stylist"),
});

// Reyna proposes content/copy changes to the public site; Aidenn (dev) reviews
// and applies them manually. This is a suggestion inbox, not a CMS — nothing
// here ever writes to the public pages automatically.
export const proposedChanges = pgTable("proposed_changes", {
  id: text("id").primaryKey(),
  submittedByStylistId: text("submitted_by_stylist_id")
    .notNull()
    .references(() => stylists.id),
  page: text("page", {
    enum: ["home", "services", "team", "story", "grand-opening", "join-the-team", "visit", "other"],
  }).notNull(),
  content: text("content").notNull(),
  status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .default(sql`now()`),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Null until the owner confirms real values — UI must show
  // "Contact the salon to confirm" rather than inventing a number.
  durationMinutes: integer("duration_minutes"),
  priceCents: integer("price_cents"),
  active: boolean("active").notNull().default(true),
});

// One row per exact (stylist, calendar date) the stylist has explicitly set.
// No row for a date means that stylist is simply not bookable that day — there
// is no indefinite recurring rule to fall back to. A stylist becomes bookable
// either one date at a time (calendar picker) or in bulk via the "generate"
// endpoint, which itself just writes rows here for the dates it covers. This
// is what makes a day genuinely "confirmed" rather than assumed.
// isClosed=true means unavailable that day (startMinute/endMinute null).
// isClosed=false with start/end set means "available this window that day".
export const availabilityDays = pgTable(
  "availability_days",
  {
    id: text("id").primaryKey(),
    stylistId: text("stylist_id")
      .notNull()
      .references(() => stylists.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD, salon-local calendar date
    isClosed: boolean("is_closed").notNull().default(true),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    note: text("note"),
  },
  (t) => [uniqueIndex("availability_days_stylist_date_idx").on(t.stylistId, t.date)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    confirmationCode: text("confirmation_code").notNull().unique(),
    serviceId: text("service_id")
      .notNull()
      .references(() => services.id),
    stylistId: text("stylist_id")
      .notNull()
      .references(() => stylists.id),
    // Stored as timestamptz; kept in "string" mode (ISO 8601) so app code works
    // with plain ISO strings throughout, same as the rest of this codebase.
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email").notNull(),
    clientPhone: text("client_phone").notNull(),
    notes: text("notes"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    status: text("status", {
      enum: ["pending", "confirmed", "cancelled"],
    })
      .notNull()
      .default("confirmed"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // The core double-booking guard: the database itself refuses a second
    // appointment for the same stylist at the same start instant.
    uniqueIndex("appointments_stylist_start_idx").on(t.stylistId, t.startAt),
  ],
);

export const emailLog = pgTable("email_log", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").references(() => appointments.id, {
    onDelete: "cascade",
  }),
  recipient: text("recipient").notNull(),
  kind: text("kind", { enum: ["client_confirmation", "salon_notification"] }).notNull(),
  status: text("status", { enum: ["sent", "failed", "skipped_no_provider"] }).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .default(sql`now()`),
});
