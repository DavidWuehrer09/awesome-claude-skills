import { compareTwo } from "@/server/services/progress";
import { AppError, ok, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async (req: Request) => {
  const u = new URL(req.url);
  const a = u.searchParams.get("a"), b = u.searchParams.get("b");
  if (!a || !b) throw new AppError("invalid_input", "Pass ?a=<assessmentId>&b=<assessmentId>.");
  return ok({ caveats: await compareTwo(a, b) });
});
