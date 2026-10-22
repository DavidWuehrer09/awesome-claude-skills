import { GenerateExerciseInput, generateExercise, listExercises } from "@/server/services/training";
import { ok, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const GET = route(async () => ok(await listExercises()));
export const POST = route(async (req: Request) => ok(await generateExercise(await readJson(req, GenerateExerciseInput)), 201));
