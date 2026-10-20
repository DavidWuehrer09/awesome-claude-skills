import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE } from "@/server/auth";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteAccount } from "@/server/repos/account";

export const DELETE = route(async (req) => {
  const { user, db } = await ctx();
  const { password } = await parseJson(req, z.object({ password: z.string().max(200) }));
  await deleteAccount(db, user.id, password);
  (await cookies()).delete(SESSION_COOKIE);
  return { deleted: true };
});
