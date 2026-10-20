import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { examinerWeaknesses } from "@/server/repos/examiner";

export const GET = route(async () => {
  const { user, db } = await ctx();
  return examinerWeaknesses(db, user.id);
});
