-- Enables Row Level Security on every table as defense-in-depth (Supabase
-- flags public tables without RLS). The real authorization boundary for this
-- app is server-side, in booking-app/middleware.ts and the API routes under
-- app/api/** — every one of these tables is only ever reached through that
-- validated server code, never directly from the browser. These policies
-- exist so that even a misconfigured or future client-side query can't read
-- or write anything by default.
--
-- All data access in this app goes through Drizzle using DATABASE_URL, which
-- connects as the Postgres role configured for that connection string (not
-- through PostgREST), so these policies primarily matter if anything is ever
-- changed to query Supabase via supabase-js/PostgREST directly.

alter table appointments enable row level security;
alter table availability_exceptions enable row level security;
alter table email_log enable row level security;
alter table services enable row level security;
alter table stylists enable row level security;
alter table weekly_hours enable row level security;

-- No PostgREST-based client access is expected by default: no policies are
-- defined, which means every table denies all access via the REST/anon API
-- until a policy is explicitly added. Service-role connections (and this
-- app's direct Postgres connection) bypass RLS entirely, as intended.
