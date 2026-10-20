import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { draftSchema, getAttempt, saveAttemptDraft } from "@/server/repos/examiner";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getAttempt(db, user.id, id);
});

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return saveAttemptDraft(db, user.id, id, await parseJson(req, draftSchema, 400_000));
});
