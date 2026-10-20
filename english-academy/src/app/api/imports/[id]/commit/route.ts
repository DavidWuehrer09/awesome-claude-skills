import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { commitImport, commitSchema } from "@/server/repos/imports";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { user, db } = await ctx();
  return commitImport(db, user.id, id, await parseJson(req, commitSchema, 2_000_000));
});
