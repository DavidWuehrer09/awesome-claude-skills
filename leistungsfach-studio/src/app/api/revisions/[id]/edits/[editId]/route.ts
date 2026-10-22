import { z } from "zod";
import { setEditState } from "@/server/services/revision";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string; editId: string }> };
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { state } = await readJson(req, z.object({ state: z.enum(["pending", "accepted", "rejected"]) }));
  const { id, editId } = await ctx.params;
  return ok(await setEditState(id, editId, state));
});
