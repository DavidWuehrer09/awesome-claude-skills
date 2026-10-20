import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { deleteMaterial, getMaterial, materialPatchSchema, updateMaterial } from "@/server/repos/examiner";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  return { material: await getMaterial(db, user.id, id) };
});

export const PATCH = route<P>(async (req, { id }) => {
  const { user, db } = await ctx();
  return { material: await updateMaterial(db, user.id, id, await parseJson(req, materialPatchSchema, 1_000_000)) };
});

export const DELETE = route<P>(async (_req, { id }) => {
  const { user, db } = await ctx();
  await deleteMaterial(db, user.id, id);
  return { ok: true };
});
