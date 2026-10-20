import { ctx } from "@/server/ctx";
import { HttpError, route } from "@/server/http";
import { pushConfigured, sendPush } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";

export const POST = route(async () => {
  const { user, db } = await ctx();
  if (!pushConfigured()) throw new HttpError(503, "Push notifications are not configured on this server", "not_configured");
  await rateLimit(db, `pushtest:${user.id}`, 3, 60);
  return sendPush(db, user.id, { title: "Test notification", body: "Reminders are working on this device.", url: "/" });
});
