import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { cancelImport } from "@/server/repos/imports";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { job: await cancelImport(db, user.id, id) };
});
