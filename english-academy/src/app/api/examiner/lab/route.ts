import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { labSchema, runLab } from "@/server/repos/examiner";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return runLab(db, user.id, await parseJson(req, labSchema, 200_000));
});
