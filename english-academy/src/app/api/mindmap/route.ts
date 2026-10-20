import { ctx } from "@/server/ctx";
import { badRequest, route } from "@/server/http";
import { buildMap } from "@/server/repos/mindmap";

export const GET = route(async (req) => {
  const { user, db } = await ctx();
  const topicId = req.nextUrl.searchParams.get("topic");
  if (!topicId) throw badRequest("topic is required");
  return buildMap(db, user.id, topicId);
});
