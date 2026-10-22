import { generateProgressReview } from "@/server/services/progress";
import { ok, route } from "@/server/http";

export const maxDuration = 120;
export const POST = route(async () => ok(await generateProgressReview(), 201));
