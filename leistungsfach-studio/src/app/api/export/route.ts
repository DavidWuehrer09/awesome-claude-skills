import { exportAll } from "@/server/services/data";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const data = await exportAll();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="leistungsfach-studio-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
