import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { assessSubmission } from "@/server/repos/writing";

export const maxDuration = 300;

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { wantEstimate } = await parseJson(req, z.object({ wantEstimate: z.boolean().default(false) }));
  return { assessment: await assessSubmission(db, user.id, id, { wantEstimate }) };
});
