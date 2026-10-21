import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { weeklyPlan, weeklySummary } from "@/server/repos/planning";

export const GET = route(async () => {
  const { user, db } = await ctx();
  const [plan, summary] = await Promise.all([weeklyPlan(db, user.id), weeklySummary(db, user.id)]);
  return { plan, summary };
});
