-- Same rationale as 0001_rls.sql: defense-in-depth, not the real boundary
-- (that's the API routes + session checks). No policies defined on purpose —
-- this table is only ever reached through app/api/admin/proposals/*.
alter table proposed_changes enable row level security;
