import { retryLearnerUpdate } from "@/server/services/assessment";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;
export const POST = route(async (_req: Request, ctx: Ctx) => ok(await retryLearnerUpdate((await ctx.params).id)));
