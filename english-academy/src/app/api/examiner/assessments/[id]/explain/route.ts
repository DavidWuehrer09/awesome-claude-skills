import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { explainComment } from "@/server/repos/examiner";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { commentId } = await parseJson(req, z.object({ commentId: z.string().min(1).max(20) }));
  return explainComment(db, user.id, id, commentId);
});
