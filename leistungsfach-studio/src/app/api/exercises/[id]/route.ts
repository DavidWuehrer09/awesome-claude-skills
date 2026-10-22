import { getExercise } from "@/server/services/training";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: Ctx) => ok(await getExercise((await ctx.params).id)));
