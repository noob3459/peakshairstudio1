/**
 * Postgres unique-constraint violations (SQLSTATE 23505) come back from the
 * `postgres` driver nested under `err.cause`, not in the top-level Drizzle
 * error's own message — checking err.message alone misses it. This is what
 * the double-booking guard (UNIQUE(stylist_id, start_at)) actually trips.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const cause = (err as { cause?: unknown }).cause;
  const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
  if (code === "23505") return true;

  const message = err instanceof Error ? err.message : String(err);
  const causeMessage = cause instanceof Error ? cause.message : "";
  return (
    message.includes("duplicate key value") ||
    causeMessage.includes("duplicate key value") ||
    message.includes("UNIQUE constraint") ||
    causeMessage.includes("UNIQUE constraint")
  );
}
