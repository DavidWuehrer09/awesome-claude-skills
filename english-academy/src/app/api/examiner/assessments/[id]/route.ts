import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getAssessment } from "@/server/repos/examiner";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getAssessment(db, user.id, id);
});
