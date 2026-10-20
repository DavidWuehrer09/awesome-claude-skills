import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { disputeComment, disputeSchema } from "@/server/repos/examiner";

export const maxDuration = 120;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return disputeComment(db, user.id, id, await parseJson(req, disputeSchema));
});
