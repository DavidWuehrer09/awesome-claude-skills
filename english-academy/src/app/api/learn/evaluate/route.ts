import { z } from "zod";
import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";

const schema = z.object({
  task: z.enum(["sentence", "translation", "transformation", "error_correction", "context_choice", "production", "writing_transfer", "paragraph", "sentence_lab"]),
  instructions: z.string().max(3000),
  objective: z.string().max(500),
  targetWords: z.array(z.string().max(120)).max(12),
  learnerAnswer: z.string().max(6000),
  sourceText: z.string().max(6000).nullish(),
  referenceAnswers: z.array(z.string().max(1000)).max(6).optional(),
});

/** Semantic evaluation of free answers (sentences, translations...). Deterministic checks happen client-side first. */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const input = await parseJson(req, schema);
  const { data, meta } = await runFeature(db, user.id, "evaluate", input);
  return { evaluation: data, meta };
});
