import { z } from "zod";
import { REVISION_DEPTHS } from "@/lib/ai/prompts/revision";
import { createRevision } from "@/server/services/revision";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { depth } = await readJson(req, z.object({ depth: z.enum(REVISION_DEPTHS) }));
  return ok(await createRevision((await ctx.params).id, depth), 201);
});
