import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteDraft, draftPatchSchema, getDraft, saveDraft } from "@/server/repos/writing";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getDraft(db, user.id, id);
});

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { draft: await saveDraft(db, user.id, id, await parseJson(req, draftPatchSchema, 300_000)) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteDraft(db, user.id, id);
  return { ok: true };
});
