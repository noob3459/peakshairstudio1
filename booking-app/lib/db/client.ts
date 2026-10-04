import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// DATABASE_URL is the Supabase project's Postgres connection string
// (Project Settings -> Database -> Connection string -> "Transaction" pooler
// is recommended for serverless). Server-only — never exposed to the browser.
// See booking-app/README.md "Environment variables".
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Missing DATABASE_URL. Set it to your Supabase project\'s Postgres connection string — see booking-app/README.md "Environment variables".',
    );
  }
  return url;
}

const client = postgres(requireDatabaseUrl(), { prepare: false });

export const db = drizzle(client, { schema });
export type DB = typeof db;
