import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getEntry } from "@/server/repos/vocab";

/** Returns suggestions only. Nothing is saved until the learner applies them. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  const { entry, examples, topics } = await getEntry(db, user.id, id);
  const { data, meta } = await runFeature(db, user.id, "enrich", {
    headword: entry.headword, partOfSpeech: entry.partOfSpeech, translationDe: entry.translationDe, definitionEn: entry.definitionEn,
    context: examples[0]?.text ?? null, topic: topics[0]?.name ?? null,
  });
  return { suggestions: data, meta };
});
