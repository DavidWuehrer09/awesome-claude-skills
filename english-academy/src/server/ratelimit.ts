import "server-only";
import { lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";
import { HttpError } from "./http";

/**
 * Fixed-window rate limiter stored in the database, so the limit holds across
 * every app instance (serverless functions, several containers). One atomic
 * upsert per check; old windows are pruned occasionally.
 */
export async function rateLimit(db: Db, key: string, limit: number, windowSeconds: number, message = "Too many requests. Please wait a moment.") {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await db.insert(rateLimitCounters).values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimitCounters.key, rateLimitCounters.windowStart], set: { count: sql`${rateLimitCounters.count} + 1` } })
    .returning({ count: rateLimitCounters.count });
  if (Math.random() < 0.01) {
    await db.delete(rateLimitCounters).where(lt(rateLimitCounters.windowStart, new Date(now - 2 * 86400000))).catch(() => undefined);
  }
  if (row.count > limit) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - now) / 1000);
    throw new HttpError(429, message, "rate_limited", { retryAfterSeconds: retryAfter });
  }
}

/** Client address for anonymous limits (sign-up, login). Behind a proxy, the first X-Forwarded-For entry. */
export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
