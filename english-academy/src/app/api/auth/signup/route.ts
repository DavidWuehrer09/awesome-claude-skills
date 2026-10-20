import { z } from "zod";
import { getDb } from "@/db/client";
import { createSession, createUser, setSessionCookie } from "@/server/auth";
import { HttpError, parseJson, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/ratelimit";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  displayName: z.string().trim().max(60).optional(),
});

export const POST = route(async (req) => {
  if (process.env.SIGNUPS === "closed") throw new HttpError(403, "New registrations are currently closed.", "signups_closed");
  const db = await getDb();
  await rateLimit(db, `signup:${clientIp(req.headers)}`, Number(process.env.SIGNUP_RATE_LIMIT ?? 5), 3600, "Too many sign-ups from this network. Try again later.");
  const body = await parseJson(req, schema);
  const user = await createUser(db, body.email, body.password, body.displayName);
  const { token, expires } = await createSession(db, user.id);
  await setSessionCookie(token, expires);
  return { user };
});
