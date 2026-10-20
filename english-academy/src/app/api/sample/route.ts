import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { loadSample, removeSample } from "@/server/repos/account";

export const POST = route(async () => {
  const { user, db } = await ctx();
  return loadSample(db, user.id);
});

export const DELETE = route(async () => {
  const { user, db } = await ctx();
  return removeSample(db, user.id);
});
