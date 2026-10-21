import { z } from "zod";
import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { activityTrend } from "@/server/repos/planning";

export const GET = route(async (req) => {
  const { user, db } = await ctx();
  const weeks = z.coerce.number().int().refine((n) => [4, 12, 26].includes(n)).catch(12).parse(req.nextUrl.searchParams.get("weeks"));
  return { weeks: await activityTrend(db, user.id, weeks) };
});
