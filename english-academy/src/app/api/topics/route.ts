import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { createTopic, topicInputSchema, topicTree } from "@/server/repos/vocab";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { topics: await topicTree(db, user.id) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return { topic: await createTopic(db, user.id, await parseJson(req, topicInputSchema)) };
});
