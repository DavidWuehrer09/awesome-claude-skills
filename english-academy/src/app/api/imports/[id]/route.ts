import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { getImportJob } from "@/server/repos/imports";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { job: await getImportJob(db, user.id, id) };
});
