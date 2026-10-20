import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { assessAttempt } from "@/server/repos/examiner";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { version } = await parseJson(req, z.object({ version: z.number().int().min(1).optional() }));
  const a = await assessAttempt(db, user.id, id, version);
  return { assessment: { id: a.id, status: a.status } };
});
