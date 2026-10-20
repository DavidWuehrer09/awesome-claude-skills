import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSubscriptions, userSettings } from "@/db/schema";
import { ctx } from "@/server/ctx";
import { HttpError, parseJson, route } from "@/server/http";
import { pushConfigured } from "@/server/notifications";

const schema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints must use https"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  if (!pushConfigured()) throw new HttpError(503, "Push notifications are not configured on this server", "not_configured");
  const sub = await parseJson(req, schema);
  await db.insert(pushSubscriptions).values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failureCount: 0 } });
  await db.update(userSettings).set({ pushEnabled: true }).where(eq(userSettings.userId, user.id));
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const { user, db } = await ctx();
  const { endpoint } = await parseJson(req, z.object({ endpoint: z.string().max(1000).optional() }));
  if (endpoint) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  else await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  const left = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  if (!left.length) await db.update(userSettings).set({ pushEnabled: false }).where(eq(userSettings.userId, user.id));
  return { ok: true };
});
