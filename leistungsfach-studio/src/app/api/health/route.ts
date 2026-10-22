import { getDbKind } from "@/server/db/client";
import { aiStatus } from "@/lib/ai/client";
import { ok, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const db = await getDbKind();
  return ok({ ok: true, db, ai: aiStatus() });
});
