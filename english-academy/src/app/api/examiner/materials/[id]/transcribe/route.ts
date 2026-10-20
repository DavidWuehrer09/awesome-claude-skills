import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { transcribeMaterial } from "@/server/repos/examiner";

export const maxDuration = 120;

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { material: await transcribeMaterial(db, user.id, id) };
});
