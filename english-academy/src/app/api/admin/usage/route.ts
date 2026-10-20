import { getDb } from "@/db/client";
import { costReport } from "@/server/ai/usage";
import { requireAdmin } from "@/server/auth";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return costReport(await getDb());
});
