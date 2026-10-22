import { z } from "zod";
import { reviewUse } from "@/server/services/vocab";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { sentence } = await readJson(req, z.object({ sentence: z.string().trim().min(3).max(1000) }));
  return ok(await reviewUse((await ctx.params).id, sentence));
});
