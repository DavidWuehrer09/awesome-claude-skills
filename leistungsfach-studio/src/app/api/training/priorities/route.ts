import { getPriorities } from "@/server/services/training";
import { ok, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await getPriorities()));
