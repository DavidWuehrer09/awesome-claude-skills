import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { buildSession, sessionRequestSchema } from "@/server/repos/learning";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return buildSession(db, user.id, await parseJson(req, sessionRequestSchema));
});
