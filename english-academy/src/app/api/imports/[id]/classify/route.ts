import { eq } from "drizzle-orm";
import { topics } from "@/db/schema";
import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getImportJob } from "@/server/repos/imports";

/** AI topic proposal for an import under review. Returns key → "Topic › Subtopic"; nothing is saved. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  const job = await getImportJob(db, user.id, id);
  const existing = await db.select({ name: topics.name }).from(topics).where(eq(topics.userId, user.id));
  const { data, meta } = await runFeature(db, user.id, "classify", {
    items: job.candidates.filter((c) => c.headword).map((c) => ({ key: c.key, headword: c.headword, meaning: c.definitionEn ?? c.translationDe ?? null })),
    existingTopics: existing.map((e) => e.name),
  });
  const assignments: Record<string, string> = {};
  for (const g of data.groups) for (const k of g.keys) assignments[k] = g.subtopic ? `${g.topic} › ${g.subtopic}` : g.topic;
  return { assignments, meta };
});
