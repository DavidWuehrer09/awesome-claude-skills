import { restoreEvidence } from "@/server/services/learner";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const POST = route(async (_req: Request, ctx: Ctx) => ok(await restoreEvidence((await ctx.params).id)));
