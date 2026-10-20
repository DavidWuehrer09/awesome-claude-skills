import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { draftSchema, submitAttempt } from "@/server/repos/examiner";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  const body = (req.headers.get("content-length") ?? "0") !== "0" ? await parseJson(req, draftSchema, 400_000) : undefined;
  return { version: await submitAttempt(db, user.id, id, body) };
});
