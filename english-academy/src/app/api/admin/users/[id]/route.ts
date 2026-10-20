import { z } from "zod";
import { getDb } from "@/db/client";
import { setUserPlan } from "@/server/ai/usage";
import { requireAdmin } from "@/server/auth";
import { parseJson, route } from "@/server/http";

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  await requireAdmin();
  const { plan } = await parseJson(req, z.object({ plan: z.string().min(1).max(40) }));
  await setUserPlan(await getDb(), z.string().uuid().parse(id), plan);
  return { ok: true };
});
