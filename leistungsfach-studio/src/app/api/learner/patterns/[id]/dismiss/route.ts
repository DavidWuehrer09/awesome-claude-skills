import { DismissInput, dismissPattern } from "@/server/services/learner";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const POST = route(async (req: Request, ctx: Ctx) => ok(await dismissPattern((await ctx.params).id, (await readJson(req, DismissInput)).reason)));
