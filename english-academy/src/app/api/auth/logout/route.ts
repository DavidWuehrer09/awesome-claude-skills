import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { destroySession, SESSION_COOKIE } from "@/server/auth";
import { route } from "@/server/http";

export const POST = route(async () => {
  const jar = await cookies();
  await destroySession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return { ok: true };
});
