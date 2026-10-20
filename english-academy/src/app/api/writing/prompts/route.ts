import { desc, eq } from "drizzle-orm";
import { writingPrompts } from "@/db/schema";
import { LIBRARY, SENTENCE_LAB } from "@/domain/writing/library";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { createDraft, createPrompt, promptCreateSchema } from "@/server/repos/writing";

export const GET = route(async () => {
  const { user, db } = await ctx();
  const mine = await db.select().from(writingPrompts).where(eq(writingPrompts.userId, user.id)).orderBy(desc(writingPrompts.createdAt)).limit(50);
  return {
    library: LIBRARY.map(({ sourceText, answerKey, ...l }) => ({ ...l, hasSource: !!sourceText, hasKey: !!answerKey })),
    sentenceLab: SENTENCE_LAB.map(({ key, focus, sentence }) => ({ key, focus, sentence })),
    mine: mine.map(({ answerKey, ...p }) => ({ ...p, hasKey: !!answerKey })),
  };
});

/** Create a prompt (library, AI-generated or user-written) and immediately open a draft for it. */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const prompt = await createPrompt(db, user.id, await parseJson(req, promptCreateSchema));
  const draft = await createDraft(db, user.id, prompt.id);
  return { prompt, draft };
});
