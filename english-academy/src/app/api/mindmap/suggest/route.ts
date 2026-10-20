import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { suggestLinks } from "@/server/repos/mindmap";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { topicId } = await parseJson(req, z.object({ topicId: z.string().uuid() }));
  return suggestLinks(db, user.id, topicId);
});
