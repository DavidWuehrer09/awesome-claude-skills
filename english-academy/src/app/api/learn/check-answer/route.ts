import { z } from "zod";
import { runFeature } from "@/server/ai/service";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";

const schema = z.object({
  exercise: z.string().max(200),
  prompt: z.string().max(1000),
  context: z.string().max(1000).nullable(),
  targetWord: z.string().max(120),
  expected: z.array(z.string().max(200)).min(1).max(12),
  learnerAnswer: z.string().trim().min(1).max(120),
  answerLanguage: z.enum(["en", "de"]),
});

/**
 * Semantic second opinion on a typed answer the deterministic check marked wrong
 * (is it a valid synonym/translation here?). In demo mode this fails with
 * "disabled" and the client keeps the deterministic verdict.
 */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const input = await parseJson(req, schema);
  const { data, meta } = await runFeature(db, user.id, "answerCheck", input);
  return { check: data, meta };
});
