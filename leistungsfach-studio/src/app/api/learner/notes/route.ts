import { ManualNoteInput, addManualNote } from "@/server/services/learner";
import { ok, readJson, route } from "@/server/http";

export const POST = route(async (req: Request) => ok(await addManualNote(await readJson(req, ManualNoteInput)), 201));
