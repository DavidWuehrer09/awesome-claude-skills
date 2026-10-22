import { VocabInput, createVocab, listVocab } from "@/server/services/vocab";
import { ok, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async (req: Request) => {
  const u = new URL(req.url);
  return ok(await listVocab({ q: u.searchParams.get("q") ?? undefined, status: u.searchParams.get("status") ?? undefined, due: u.searchParams.get("due") === "1" }));
});
export const POST = route(async (req: Request) => ok(await createVocab(await readJson(req, VocabInput)), 201));
