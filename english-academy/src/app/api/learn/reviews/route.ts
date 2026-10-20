import { z } from "zod";
import { ctx } from "@/server/ctx";
import { HttpError, parseJson, route } from "@/server/http";
import { recordReview, reviewEventSchema, type ReviewResult } from "@/server/repos/learning";

/**
 * Batch endpoint used by the client's offline queue. Each event carries a
 * client-generated id, so retries and duplicate submissions are harmless.
 */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { events } = await parseJson(req, z.object({ events: z.array(reviewEventSchema).min(1).max(200) }));
  const sorted = [...events].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const results: (ReviewResult | { clientEventId: string; error: string; retry: boolean })[] = [];
  for (const ev of sorted) {
    try {
      results.push(await recordReview(db, user.id, ev));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      results.push({ clientEventId: ev.clientEventId, error: e instanceof Error ? e.message : "failed", retry: status >= 500 });
    }
  }
  return { results };
});
