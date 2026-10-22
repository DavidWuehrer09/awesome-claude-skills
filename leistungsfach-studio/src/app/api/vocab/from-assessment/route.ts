import { z } from "zod";
import { addFromAssessment } from "@/server/services/vocab";
import { ok, readJson, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const { assessmentId, index } = await readJson(req, z.object({ assessmentId: z.string(), index: z.number().int().min(0).max(20) }));
  return ok(await addFromAssessment(assessmentId, index), 201);
});
