import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { generateDrills } from "@/server/repos/examiner";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const { skills } = await parseJson(req, z.object({ skills: z.array(z.string().max(60)).max(4).optional() }));
  return generateDrills(db, user.id, skills);
});
