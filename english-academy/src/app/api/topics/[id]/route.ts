import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteTopic, topicInputSchema, updateTopic } from "@/server/repos/vocab";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { topic: await updateTopic(db, user.id, id, await parseJson(req, topicInputSchema.partial())) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteTopic(db, user.id, id);
  return { ok: true };
});
