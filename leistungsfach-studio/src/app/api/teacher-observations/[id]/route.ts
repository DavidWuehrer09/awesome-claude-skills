import { dismissTeacherObservation } from "@/server/services/calibration";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const DELETE = route(async (_req: Request, ctx: Ctx) => { await dismissTeacherObservation((await ctx.params).id); return ok({ dismissed: true }); });
