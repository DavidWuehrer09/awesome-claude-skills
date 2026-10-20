import { z } from "zod";
import { getDb } from "@/db/client";
import { authenticate, createSession, setSessionCookie } from "@/server/auth";
import { HttpError, parseJson, route } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

const schema = z.object({ email: z.string().trim().max(200), password: z.string().max(200) });

export const POST = route(async (req) => {
  const body = await parseJson(req, schema);
  rateLimit(`login:${body.email.toLowerCase()}`, 8, 4);
  const db = await getDb();
  const user = await authenticate(db, body.email, body.password);
  if (!user) throw new HttpError(401, "Email or password is incorrect", "invalid_credentials");
  const { token, expires } = await createSession(db, user.id);
  await setSessionCookie(token, expires);
  return { user };
});
