import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { dismissPattern } from "@/server/repos/planning";

export const DELETE = route<{ category: string }>(async (_req, { category }) => {
  const { user, db } = await ctx();
  return dismissPattern(db, user.id, decodeURIComponent(category).slice(0, 60));
});
