import { CurriculumNoteInput, addCurriculumNote, listCurriculumNotes } from "@/server/services/curriculum";
import { ok, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = route(async () => ok(await listCurriculumNotes()));
export const POST = route(async (req: Request) => ok(await addCurriculumNote(await readJson(req, CurriculumNoteInput)), 201));
