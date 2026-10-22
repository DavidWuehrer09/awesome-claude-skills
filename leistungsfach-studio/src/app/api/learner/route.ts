import { getLearnerOverview } from "@/server/services/learner";
import { ok, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await getLearnerOverview()));
