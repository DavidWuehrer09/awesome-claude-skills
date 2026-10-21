import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { feedbackSchema, respondToFeedback } from "@/server/repos/writing";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return respondToFeedback(db, user.id, id, await parseJson(req, feedbackSchema));
});
