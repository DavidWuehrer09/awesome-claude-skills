import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { markDifficult } from "@/server/repos/learning";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { difficult } = await parseJson(req, z.object({ difficult: z.boolean() }));
  await markDifficult(db, user.id, id, difficult);
  return { ok: true };
});
