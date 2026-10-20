import { z } from "zod";
import { getDb } from "@/db/client";
import { createSession, createUser, setSessionCookie } from "@/server/auth";
import { parseJson, route } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  displayName: z.string().trim().max(60).optional(),
});

export const POST = route(async (req) => {
  rateLimit(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, Number(process.env.SIGNUP_RATE_LIMIT ?? 5), 2);
  const body = await parseJson(req, schema);
  const db = await getDb();
  const user = await createUser(db, body.email, body.password, body.displayName);
  const { token, expires } = await createSession(db, user.id);
  await setSessionCookie(token, expires);
  return { user };
});
