import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { recommendations, setRecommendationState } from "@/server/repos/progress";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { recommendations: await recommendations(db, user.id) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { key, status } = await parseJson(req, z.object({ key: z.string().max(80), status: z.enum(["dismissed", "postponed", "done"]) }));
  await setRecommendationState(db, user.id, key, status);
  return { ok: true };
});
