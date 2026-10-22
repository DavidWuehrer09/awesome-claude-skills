import { isSkillKey } from "@/lib/learner/skills";
import { resetSkill } from "@/server/services/learner";
import { AppError, ok, route } from "@/server/http";

type Ctx = { params: Promise<{ key: string }> };
export const POST = route(async (_req: Request, ctx: Ctx) => {
  const { key } = await ctx.params;
  if (!isSkillKey(key)) throw new AppError("not_found", "Unknown skill.", 404);
  return ok(await resetSkill(key));
});
