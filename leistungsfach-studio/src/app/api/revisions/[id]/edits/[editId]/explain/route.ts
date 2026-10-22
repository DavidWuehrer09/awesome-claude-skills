import { z } from "zod";
import { explainEdit } from "@/server/services/revision";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string; editId: string }> };
export const maxDuration = 120;
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { question } = await readJson(req, z.object({ question: z.string().max(1000).default("") }));
  const { id, editId } = await ctx.params;
  return ok(await explainEdit(id, editId, question), 201);
});
