import { deleteCurriculumNote } from "@/server/services/curriculum";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const DELETE = route(async (_req: Request, ctx: Ctx) => { await deleteCurriculumNote((await ctx.params).id); return ok({ deleted: true }); });
