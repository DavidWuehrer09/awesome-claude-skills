import { getRevisionView } from "@/server/services/revision";
import { ok, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: Ctx) => ok(await getRevisionView((await ctx.params).id)));
