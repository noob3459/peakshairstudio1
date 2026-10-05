// Best-effort per-key rate limit for public, unauthenticated endpoints (e.g.
// the appointment lookup, which is otherwise just "guess an email/phone").
// In-memory only — resets whenever the serverless function cold-starts, so
// under Vercel's distributed instances this is a speed bump against casual
// scripted lookups, not a hard guarantee. If that stops being good enough,
// move the counters to a shared store (the Postgres DB already in use, or
// Redis) instead of layering more onto this.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
