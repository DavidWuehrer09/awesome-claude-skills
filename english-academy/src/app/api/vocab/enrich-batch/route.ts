import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { enrichBatch, MAX_ENRICH_BATCH } from "@/server/repos/enrichment";

export const maxDuration = 300;

/** Enrich several words sequentially, filling only empty fields. Stops cleanly on quota errors. */
export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string().uuid()).min(1).max(MAX_ENRICH_BATCH) }));
  return enrichBatch(db, user.id, ids);
});
