import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { startAttempt } from "@/server/repos/examiner";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { examId, timed } = await parseJson(req, z.object({ examId: z.string().uuid(), timed: z.boolean().default(true) }));
  return { attempt: await startAttempt(db, user.id, examId, timed) };
});
