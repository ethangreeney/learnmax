// Extremely lightweight best-effort rate limiter using in-memory counters per process.
// For production, swap to Upstash or a DB-backed limiter.

type Key = string;
type WindowMs = number;

const buckets: Map<Key, { resetAt: number; count: number }> = new Map();
let calls = 0;

export function rateLimitKey(
  req: Request,
  namespace: string,
  userId?: string | null
): string {
  if (userId) return `${namespace}:user:${userId}`;

  const forwarded = req.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'anonymous';
  return `${namespace}:ip:${ip}`;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: WindowMs
): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  calls += 1;
  if (calls % 500 === 0) {
    for (const [bucketKey, bucketValue] of buckets) {
      if (bucketValue.resetAt <= now) buckets.delete(bucketKey);
    }
  }

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
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}
