-- Append-only audit trail of staff actions on appointments (created,
-- confirmed, cancelled, rescheduled), so the dev account can review what
-- every stylist/owner has done and when. Client self-bookings also get a
-- "created" row with actor_stylist_id null. Names are snapshotted at event
-- time (not joined live) so the log stays accurate even if a stylist is
-- later renamed or removed. See lib/db/schema.ts (appointmentEvents).

create table appointment_events (
  id text primary key,
  appointment_id text references appointments(id) on delete cascade,
  action text not null check (action in ('created', 'confirmed', 'cancelled', 'rescheduled')),
  actor_stylist_id text references stylists(id) on delete set null,
  actor_name text not null,
  client_name text not null,
  service_name text not null,
  stylist_name text not null,
  start_at timestamptz not null,
  previous_start_at timestamptz,
  created_at timestamptz not null default now()
);

create index appointment_events_created_at_idx on appointment_events (created_at desc);
create index appointment_events_actor_stylist_id_idx on appointment_events (actor_stylist_id);

-- Same rationale as 0001_rls.sql / 0004_proposed_changes_rls.sql /
-- 0005_availability_days.sql: defense-in-depth, not the real boundary
-- (that's the API routes). No policies defined on purpose — this table is
-- only ever reached through app/api/admin/appointment-log and the
-- appointment create/patch routes.
alter table appointment_events enable row level security;
