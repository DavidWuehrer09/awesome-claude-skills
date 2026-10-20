import { blueprintSchema } from "@/domain/examiner/model";
import { ctx } from "@/server/ctx";
import { parseJson, route } from "@/server/http";
import { generateExam, listExams } from "@/server/repos/examiner";

export const maxDuration = 300;

export const GET = route(async () => {
  const { user, db } = await ctx();
  return { exams: await listExams(db, user.id) };
});

export const POST = route(async (req) => {
  const { user, db } = await ctx();
  return generateExam(db, user.id, await parseJson(req, blueprintSchema));
});
