import { deleteTeacherFeedback } from "@/server/services/calibration";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const DELETE = route(async (_req: Request, ctx: Ctx) => { await deleteTeacherFeedback((await ctx.params).id); return ok({ deleted: true }); });
