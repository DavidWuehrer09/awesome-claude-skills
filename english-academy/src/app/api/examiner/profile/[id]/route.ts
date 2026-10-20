import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteProfileEntry, profileEntrySchema, updateProfileEntry } from "@/server/repos/examiner";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { entry: await updateProfileEntry(db, user.id, id, await parseJson(req, profileEntrySchema)) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteProfileEntry(db, user.id, id);
  return { ok: true };
});
