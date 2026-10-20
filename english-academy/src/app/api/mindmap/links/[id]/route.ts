import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { deleteLink } from "@/server/repos/mindmap";

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteLink(db, user.id, id);
  return { ok: true };
});
