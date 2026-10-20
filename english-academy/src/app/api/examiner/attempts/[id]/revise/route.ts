import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { reviseAttempt, reviseSchema } from "@/server/repos/examiner";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { version: await reviseAttempt(db, user.id, id, await parseJson(req, reviseSchema, 400_000)) };
});
