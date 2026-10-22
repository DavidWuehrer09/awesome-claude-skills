import { TeacherFeedbackInput, addTeacherFeedback } from "@/server/services/calibration";
import { ok, readJson, route } from "@/server/http";

export const POST = route(async (req: Request) => ok(await addTeacherFeedback(await readJson(req, TeacherFeedbackInput)), 201));
