import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { listTags } from "@/server/repos/vocab";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { tags: await listTags(db, user.id) };
});
