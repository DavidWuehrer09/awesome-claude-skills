import { z } from "zod";
import { exerciseKindsAI } from "@/server/ai/features";
import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { loadEntryPool } from "@/server/repos/learning";

const schema = z.object({
  kind: z.enum(exerciseKindsAI),
  entryIds: z.array(z.string().uuid()).min(1).max(12),
  topic: z.string().max(80).nullish(),
  count: z.number().int().min(1).max(10).default(5),
  focus: z.string().max(80).nullish(),
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const body = await parseJson(req, schema);
  const pool = await loadEntryPool(db, user.id, body.entryIds);
  const { data, meta } = await runFeature(db, user.id, "generate", {
    kind: body.kind, count: body.count, topic: body.topic ?? null, focus: body.focus ?? null,
    entries: pool.map((e) => ({ headword: e.headword, meaning: e.definitionEn ?? e.translationDe, example: e.examples[0] ?? null })),
  });
  const idByWord = new Map(pool.map((e) => [e.headword.toLowerCase(), e.id]));
  return { items: data.items.map((i) => ({ ...i, entryId: i.targetWord ? idByWord.get(i.targetWord.toLowerCase()) ?? null : null })), meta };
});
