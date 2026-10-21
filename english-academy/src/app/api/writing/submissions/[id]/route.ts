import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getSubmission, ownVocabularyJudged, type AssessData } from "@/server/repos/writing";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  const data = await getSubmission(db, user.id, id);
  // Judgements only from a real assessment; demo output never judged word use.
  const a = data.assessment;
  const result = a?.status === "complete" && !a.isDemo ? (a.result as unknown as AssessData) : null;
  return { ...data, vocabularyUsed: await ownVocabularyJudged(db, user.id, data.submission.body, result) };
});
