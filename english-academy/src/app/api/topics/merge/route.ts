import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { mergeTopics } from "@/server/repos/vocab";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { sourceId, targetId } = await parseJson(req, z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() }));
  await mergeTopics(db, user.id, sourceId, targetId);
  return { ok: true };
});
