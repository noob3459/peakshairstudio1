-- Replaces weekly_hours (an indefinite recurring rule) + availability_exceptions
-- (one-off overrides) with a single availability_days table: one row per exact
-- (stylist, date). No row for a date means that stylist is not bookable that
-- day — there is no implicit recurring fallback. A stylist becomes bookable
-- either one date at a time (calendar picker in /staff/availability) or in
-- bulk via the new generate endpoint, which itself just writes rows here for
-- a bounded number of weeks. See lib/availability.ts and lib/db/schema.ts.
--
-- Confirmed before writing this migration: weekly_hours held only the
-- placeholder sample data scripts/seed.ts inserted (15 rows, identical
-- Tue-Fri 9-5 / Sat 9-2 for all three stylists) and availability_exceptions
-- was empty — so nothing real is lost by dropping both tables.

drop table if exists weekly_hours;
drop table if exists availability_exceptions;

create table availability_days (
  id text primary key,
  stylist_id text not null references stylists(id) on delete cascade,
  date text not null,
  is_closed boolean not null default true,
  start_minute integer,
  end_minute integer,
  note text,
  unique (stylist_id, date)
);

-- Same rationale as 0001_rls.sql / 0004_proposed_changes_rls.sql:
-- defense-in-depth, not the real boundary (that's the API routes). No
-- policies defined on purpose — this table is only ever reached through
-- app/api/admin/availability/*.
alter table availability_days enable row level security;
