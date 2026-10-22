import { EssayInput, createEssay, listEssays } from "@/server/services/essays";
import { ok, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await listEssays()));
export const POST = route(async (req: Request) => ok(await createEssay(await readJson(req, EssayInput)), 201));
