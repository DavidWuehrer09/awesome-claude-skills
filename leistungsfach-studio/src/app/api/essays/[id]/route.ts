import { deleteEssay, getEssayDetail } from "@/server/services/essays";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: Ctx) => ok(await getEssayDetail((await ctx.params).id)));
export const DELETE = route(async (_req: Request, ctx: Ctx) => { await deleteEssay((await ctx.params).id); return ok({ deleted: true }); });
