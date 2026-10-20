import { ctx } from "@/server/ctx";
import { route } from "@/server/http";
import { submitDraft } from "@/server/repos/writing";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { submission: await submitDraft(db, user.id, id) };
});
