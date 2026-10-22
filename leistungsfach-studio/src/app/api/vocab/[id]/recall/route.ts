import { z } from "zod";
import { reviewRecall } from "@/server/services/vocab";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { response } = await readJson(req, z.object({ response: z.string().max(300) }));
  return ok(await reviewRecall((await ctx.params).id, response));
});
