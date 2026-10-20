import "server-only";
import { HttpError } from "./http";

/**
 * Small in-process token bucket. Good enough for a single instance; for a
 * multi-instance deployment put a shared limiter (e.g. Redis) behind the same
 * interface. AI usage additionally has a daily cap enforced in the database.
 */
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(key: string, capacity: number, refillPerMinute: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 60000) * refillPerMinute);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    throw new HttpError(429, "Too many requests. Please wait a moment.", "rate_limited");
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10000) buckets.clear();
}

export function resetRateLimits() {
  buckets.clear();
}
