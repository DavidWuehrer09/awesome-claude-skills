import { evaluateAttempt } from "@/server/services/training";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120;
export const POST = route(async (_req: Request, ctx: Ctx) => ok(await evaluateAttempt((await ctx.params).id)));
