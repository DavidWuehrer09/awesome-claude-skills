import { analyseTeacherFeedback } from "@/server/services/calibration";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 120;
export const POST = route(async (_req: Request, ctx: Ctx) => ok(await analyseTeacherFeedback((await ctx.params).id)));
