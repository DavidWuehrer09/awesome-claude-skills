import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { sessionHistory } from "@/server/repos/planning";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { sessions: await sessionHistory(db, user.id) };
});
