import { getDashboard } from "@/server/services/progress";
import { ok, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await getDashboard()));
