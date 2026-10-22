import "server-only";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TASK_TYPE_KEYS, type TaskTypeKey } from "@/lib/curriculum";
import type { VerifiedNote } from "@/lib/ai/prompts/shared";
import { getDb, schema } from "@/server/db/client";

export const CurriculumNoteInput = z.object({
  sourceId: z.string().max(20).nullable().default(null),
  title: z.string().trim().min(1).max(300),
  url: z.string().max(1000).default(""),
  passage: z.string().trim().min(20, "Paste the passage you read (at least a sentence).").max(20000),
  appliesTo: z.union([z.literal("all"), z.enum(TASK_TYPE_KEYS)]).default("all"),
});

export async function listCurriculumNotes() {
  const db = await getDb();
  return db.select().from(schema.curriculumNotes).orderBy(desc(schema.curriculumNotes.createdAt));
}

export async function addCurriculumNote(input: z.infer<typeof CurriculumNoteInput>) {
  const db = await getDb();
  const [row] = await db.insert(schema.curriculumNotes).values(input).returning();
  return row;
}

export async function deleteCurriculumNote(id: string) {
  const db = await getDb();
  await db.delete(schema.curriculumNotes).where(eq(schema.curriculumNotes.id, id));
}

export async function verifiedNotesFor(taskType: TaskTypeKey): Promise<VerifiedNote[]> {
  const notes = await listCurriculumNotes();
  return notes.filter((n) => n.appliesTo === "all" || n.appliesTo === taskType).slice(0, 6).map((n) => ({ title: n.title, url: n.url, passage: n.passage }));
}
