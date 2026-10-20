import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getSubmission, vocabularyInText } from "@/server/repos/writing";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  const data = await getSubmission(db, user.id, id);
  return { ...data, vocabularyUsed: await vocabularyInText(db, user.id, data.submission.body) };
});
