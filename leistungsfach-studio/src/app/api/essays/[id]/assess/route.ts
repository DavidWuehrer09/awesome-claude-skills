import { z } from "zod";
import { MODES } from "@/lib/curriculum";
import { assessEssay } from "@/server/services/assessment";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { mode } = await readJson(req, z.object({ mode: z.enum(MODES) }));
  return ok(await assessEssay((await ctx.params).id, mode), 201);
});
