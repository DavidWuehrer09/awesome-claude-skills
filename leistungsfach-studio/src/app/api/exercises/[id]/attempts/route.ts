import { AttemptInput, submitAttempt } from "@/server/services/training";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120;
export const POST = route(async (req: Request, ctx: Ctx) => ok(await submitAttempt((await ctx.params).id, await readJson(req, AttemptInput)), 201));
