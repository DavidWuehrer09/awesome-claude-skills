import { z } from "zod";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { endStudySession, startStudySession } from "@/server/repos/learning";

const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("start"), mode: z.string().max(40), topicId: z.string().uuid().nullish(), minutes: z.number().int().max(180).nullish() }),
  z.object({ op: z.literal("end"), id: z.string().uuid(), stats: z.record(z.string(), z.number()) }),
]);

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  const body = await parseJson(req, schema);
  if (body.op === "start") return { session: await startStudySession(db, user.id, body.mode, body.topicId ?? null, body.minutes ?? null) };
  return { session: await endStudySession(db, user.id, body.id, body.stats) };
});
