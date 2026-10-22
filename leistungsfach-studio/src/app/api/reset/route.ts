import { z } from "zod";
import { resetAll } from "@/server/services/data";
import { ok, readJson, route } from "@/server/http";

export const POST = route(async (req: Request) => {
  const { confirmation } = await readJson(req, z.object({ confirmation: z.string() }));
  await resetAll(confirmation);
  return ok({ reset: true });
});
