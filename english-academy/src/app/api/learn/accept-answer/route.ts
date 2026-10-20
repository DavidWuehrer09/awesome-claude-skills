import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { vocabEntries } from "@/db/schema";
import { ctx } from "@/server/ctx";
import { notFound, parseJson, route } from "@/server/http";

/**
 * The learner explicitly records another accepted answer for a word.
 * Traceable: stored on the entry and visible/editable in the word editor.
 */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { entryId, answer } = await parseJson(req, z.object({ entryId: z.string().uuid(), answer: z.string().trim().min(1).max(120) }));
  const [e] = await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, user.id), eq(vocabEntries.id, entryId)));
  if (!e) throw notFound("Word not found");
  const accepted = [...new Set([...e.acceptedAnswers, answer])];
  await db.update(vocabEntries).set({ acceptedAnswers: accepted, version: e.version + 1, updatedAt: new Date() }).where(eq(vocabEntries.id, entryId));
  return { acceptedAnswers: accepted };
});
