import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { addLink, linkSchema } from "@/server/repos/mindmap";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return { link: await addLink(db, user.id, await parseJson(req, linkSchema)) };
});
