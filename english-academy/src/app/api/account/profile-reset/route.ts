import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { resetLearnerProfile } from "@/server/repos/account";

export const POST = route(async () => {
  const { user, db } = await ctx();
  await resetLearnerProfile(db, user.id);
  return { ok: true };
});
