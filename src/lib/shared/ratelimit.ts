// Extremely lightweight best-effort rate limiter using in-memory counters per process.
// For production, swap to Upstash or a DB-backed limiter.

type Key = string;
type WindowMs = number;

const buckets: Map<Key, { resetAt: number; count: number }> = new Map();

export function rateLimit(key: string, limit: number, windowMs: WindowMs): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { resetAt, count: 1 });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count++;
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}



