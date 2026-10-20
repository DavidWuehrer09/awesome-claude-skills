import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { markUnhelpful, unhelpfulSchema } from "@/server/repos/examiner";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return markUnhelpful(db, user.id, id, await parseJson(req, unhelpfulSchema));
});
