import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteEntries, entryInputSchema, getEntry, updateEntry } from "@/server/repos/vocab";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return getEntry(db, user.id, id);
});

const patchSchema = z.object({ baseVersion: z.number().int().min(1), patch: entryInputSchema.partial() });

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  const { baseVersion, patch } = await parseJson(req, patchSchema);
  return { entry: await updateEntry(db, user.id, id, patch, baseVersion) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { deleted: await deleteEntries(db, user.id, [id]) };
});
