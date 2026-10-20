import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { conversationSchema, deleteConversation, getConversation, updateConversation } from "@/server/repos/tutor";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getConversation(db, user.id, id);
});

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { conversation: await updateConversation(db, user.id, id, await parseJson(req, conversationSchema)) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteConversation(db, user.id, id);
  return { ok: true };
});
