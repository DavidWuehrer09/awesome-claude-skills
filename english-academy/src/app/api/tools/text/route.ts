import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { analyseText } from "@/server/repos/tools";

/** Highlight the learner's words in a pasted text and list unknown candidate words. */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { text } = await parseJson(req, z.object({ text: z.string().max(20000) }));
  return analyseText(db, user.id, text);
});
