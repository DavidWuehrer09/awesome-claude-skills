import { z } from "zod";
import { getDb } from "@/db/client";
import { authenticate, createSession, setSessionCookie } from "@/server/auth";
import { HttpError, parseJson, route } from "@/server/http";
import { clientIp, rateLimit } from "@/server/ratelimit";

const schema = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  const db = await getDb();
  await rateLimit(db, `login:${body.email.toLowerCase()}`, 8, 300, "Too many sign-in attempts. Wait a few minutes.");
  await rateLimit(db, `login-ip:${clientIp(req.headers)}`, 40, 300, "Too many sign-in attempts. Wait a few minutes.");
  const user = await authenticate(db, body.email, body.password);
  if (!user) throw new HttpError(401, "Email or password is incorrect", "invalid_credentials");
  const { token, expires } = await createSession(db, user.id);
  await setSessionCookie(token, expires);
  return { user };
});
