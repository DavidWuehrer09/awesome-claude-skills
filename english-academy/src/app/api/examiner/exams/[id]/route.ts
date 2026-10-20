import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { deleteExam, getExamOverview } from "@/server/repos/examiner";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getExamOverview(db, user.id, id);
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteExam(db, user.id, id);
  return { ok: true };
});
