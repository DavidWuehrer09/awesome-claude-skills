import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { TASK_TYPE_KEYS } from "@/lib/curriculum";
import { wordCount } from "@/lib/text/normalize";
import { getDb, schema } from "@/server/db/client";
import { notFound } from "@/server/http";

export const ESSAY_CONTEXTS = ["practice", "homework", "classwork", "exam_simulation"] as const;

export const EssayInput = z.object({
  title: z.string().trim().min(1, "Give the essay a title.").max(200),
  taskType: z.enum(TASK_TYPE_KEYS),
  operator: z.string().max(200).default(""),
  taskPrompt: z.string().max(5000).default(""),
  sourceText: z.string().max(40000).default(""),
  essayText: z.string().trim().min(20, "The essay is too short to assess (at least a few sentences).").max(40000),
  rubricText: z.string().max(20000).default(""),
  context: z.enum(ESSAY_CONTEXTS).default("practice"),
  timeLimitMinutes: z.number().int().min(1).max(600).nullable().default(null),
  timeUsedMinutes: z.number().int().min(0).max(1000).nullable().default(null),
  parentEssayId: z.string().nullable().default(null),
  writtenAt: z.string().datetime().nullable().default(null),
});
export type EssayInputT = z.infer<typeof EssayInput>;

export async function createEssay(input: EssayInputT) {
  const db = await getDb();
  if (input.parentEssayId) {
    const parent = await db.select({ id: schema.essays.id }).from(schema.essays).where(eq(schema.essays.id, input.parentEssayId));
    if (!parent.length) throw notFound("Parent essay");
  }
  const [row] = await db.insert(schema.essays).values({
    ...input,
    wordCount: wordCount(input.essayText),
    writtenAt: input.writtenAt ? new Date(input.writtenAt) : null,
  }).returning();
  return row;
}

export async function getEssay(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.essays).where(eq(schema.essays.id, id));
  if (!row) throw notFound("Essay");
  return row;
}

export async function listEssays() {
  const db = await getDb();
  const essays = await db.select().from(schema.essays).orderBy(desc(schema.essays.createdAt));
  if (!essays.length) return [];
  const ids = essays.map((e) => e.id);
  const assessments = await db.select({
    id: schema.assessments.id, essayId: schema.assessments.essayId, mode: schema.assessments.mode, status: schema.assessments.status,
    scoreLow: schema.assessments.scoreLow, scoreHigh: schema.assessments.scoreHigh, scoreBest: schema.assessments.scoreBest,
    confidence: schema.assessments.confidence, provider: schema.assessments.provider, createdAt: schema.assessments.createdAt,
  }).from(schema.assessments).where(inArray(schema.assessments.essayId, ids)).orderBy(desc(schema.assessments.createdAt));
  const teacher = await db.select({ essayId: schema.teacherFeedback.essayId, teacherScore: schema.teacherFeedback.teacherScore })
    .from(schema.teacherFeedback).where(inArray(schema.teacherFeedback.essayId, ids));
  const revisionCounts = await db.select({ essayId: schema.revisions.essayId }).from(schema.revisions)
    .where(and(inArray(schema.revisions.essayId, ids), eq(schema.revisions.status, "completed")));
  return essays.map((e) => ({
    ...e,
    latestAssessment: assessments.find((a) => a.essayId === e.id && a.status === "completed") ?? null,
    assessmentCount: assessments.filter((a) => a.essayId === e.id && a.status === "completed").length,
    teacherScore: teacher.find((t) => t.essayId === e.id)?.teacherScore ?? null,
    revisionCount: revisionCounts.filter((r) => r.essayId === e.id).length,
  }));
}

export async function getEssayDetail(id: string) {
  const db = await getDb();
  const essay = await getEssay(id);
  const [assessments, revisions, exercises, teacher, children] = await Promise.all([
    db.select().from(schema.assessments).where(eq(schema.assessments.essayId, id)).orderBy(desc(schema.assessments.createdAt)),
    db.select({ id: schema.revisions.id, depth: schema.revisions.depth, status: schema.revisions.status, errorMessage: schema.revisions.errorMessage, createdAt: schema.revisions.createdAt, provider: schema.revisions.provider })
      .from(schema.revisions).where(eq(schema.revisions.essayId, id)).orderBy(desc(schema.revisions.createdAt)),
    db.select({ id: schema.exercises.id, skillKey: schema.exercises.skillKey, type: schema.exercises.type, status: schema.exercises.status, createdAt: schema.exercises.createdAt })
      .from(schema.exercises).where(eq(schema.exercises.sourceEssayId, id)).orderBy(desc(schema.exercises.createdAt)),
    db.select().from(schema.teacherFeedback).where(eq(schema.teacherFeedback.essayId, id)).orderBy(desc(schema.teacherFeedback.createdAt)),
    db.select({ id: schema.essays.id, title: schema.essays.title, createdAt: schema.essays.createdAt }).from(schema.essays).where(eq(schema.essays.parentEssayId, id)),
  ]);
  const parent = essay.parentEssayId
    ? (await db.select({ id: schema.essays.id, title: schema.essays.title }).from(schema.essays).where(eq(schema.essays.id, essay.parentEssayId)))[0] ?? null
    : null;
  return { essay, assessments, revisions, exercises, teacher, children, parent };
}

/** Deleting an essay removes its assessments/revisions (cascade) and the learner evidence derived from it. */
export async function deleteEssay(id: string) {
  const db = await getDb();
  await getEssay(id);
  await db.transaction(async (tx) => {
    await tx.update(schema.skillEvidence).set({ dismissedAt: new Date(), dismissedReason: "Essay deleted" }).where(eq(schema.skillEvidence.essayId, id));
    await tx.delete(schema.essays).where(eq(schema.essays.id, id));
  });
  const { removeSubmissionFromPatterns, recomputeAllSkills } = await import("./learner");
  await removeSubmissionFromPatterns(id);
  await recomputeAllSkills();
}
