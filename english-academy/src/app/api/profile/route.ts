import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { learnerProfile } from "@/server/repos/planning";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return learnerProfile(db, user.id);
});
