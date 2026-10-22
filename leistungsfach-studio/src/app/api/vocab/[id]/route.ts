import { VocabInput, deleteVocab, updateVocab, vocabReviews } from "@/server/services/vocab";
import { ok, readJson, route } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: Ctx) => ok(await vocabReviews((await ctx.params).id)));
export const PATCH = route(async (req: Request, ctx: Ctx) => ok(await updateVocab((await ctx.params).id, await readJson(req, VocabInput.partial()))));
export const DELETE = route(async (_req: Request, ctx: Ctx) => { await deleteVocab((await ctx.params).id); return ok({ deleted: true }); });
