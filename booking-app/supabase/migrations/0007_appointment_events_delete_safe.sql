-- Aidenn (dev) can now hard-delete an appointment (see DELETE on
-- app/api/admin/appointments/[id]/route.ts). That must not erase the
-- appointment's own audit history — every identifying detail is already
-- snapshotted on the appointment_events row itself — so switch the FK from
-- ON DELETE CASCADE to ON DELETE SET NULL, and widen the action check
-- constraint to allow the new "deleted" event.
--
-- Run this after 0006_appointment_events.sql (in order, same as any other
-- migration here). If 0006 has not been applied yet, just run both in order
-- now — running 0007 against a table that doesn't exist yet will simply
-- error harmlessly; apply 0006 first in that case.

alter table appointment_events drop constraint appointment_events_appointment_id_fkey;
alter table appointment_events add constraint appointment_events_appointment_id_fkey
  foreign key (appointment_id) references appointments(id) on delete set null;

alter table appointment_events drop constraint appointment_events_action_check;
alter table appointment_events add constraint appointment_events_action_check
  check (action in ('created', 'confirmed', 'cancelled', 'rescheduled', 'deleted'));
