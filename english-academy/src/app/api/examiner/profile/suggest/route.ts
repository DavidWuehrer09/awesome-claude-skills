import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { suggestProfile } from "@/server/repos/examiner";

export const maxDuration = 120;

export const POST = route(async () => {
  const { user, db } = await ctx();
  return suggestProfile(db, user.id);
});
