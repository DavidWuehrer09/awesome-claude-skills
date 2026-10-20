import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { undoReview } from "@/server/repos/learning";

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { clientEventId } = await parseJson(req, z.object({ clientEventId: z.string().min(8).max(80) }));
  return undoReview(db, user.id, clientEventId);
});
