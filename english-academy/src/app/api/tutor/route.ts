import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { conversationSchema, createConversation, listConversations } from "@/server/repos/tutor";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { conversations: await listConversations(db, user.id) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return { conversation: await createConversation(db, user.id, await parseJson(req, conversationSchema)) };
});
