import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { runAI } from "@/lib/ai/client";
import { TeacherAnalysisOutputSchema } from "@/lib/ai/schemas";
import { buildTeacherPrompt, validateTeacher } from "@/lib/ai/prompts/misc";
import { TASK_TYPE_KEYS, TASK_TYPES, type TaskTypeKey } from "@/lib/curriculum";
import { normalizeLabel } from "@/lib/text/normalize";
import { getDb, schema } from "@/server/db/client";
import { notFound } from "@/server/http";

export const TeacherFeedbackInput = z.object({
  essayId: z.string().nullable().default(null),
  teacherScore: z.number().min(0).max(15).nullable().default(null),
  comments: z.string().max(20000).default(""),
  criteria: z.string().max(20000).default(""),
  taskType: z.enum(TASK_TYPE_KEYS).nullable().default(null),
  receivedAt: z.string().datetime().nullable().default(null),
}).refine((v) => v.teacherScore !== null || v.comments.trim() || v.criteria.trim(), { message: "Enter a score, comments or criteria." });

export async function addTeacherFeedback(input: z.infer<typeof TeacherFeedbackInput>) {
  const db = await getDb();
  let taskType = input.taskType;
  if (input.essayId) {
    const [e] = await db.select().from(schema.essays).where(eq(schema.essays.id, input.essayId));
    if (!e) throw notFound("Essay");
    taskType ??= e.taskType as TaskTypeKey;
  }
  const [row] = await db.insert(schema.teacherFeedback).values({
    essayId: input.essayId, teacherScore: input.teacherScore, comments: input.comments, criteria: input.criteria, taskType,
    receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
  }).returning();
  return row;
}

export async function deleteTeacherFeedback(id: string) {
  const db = await getDb();
  await db.delete(schema.teacherFeedback).where(eq(schema.teacherFeedback.id, id));
  // Remove this feedback from observations; drop observations left without support.
  const obs = await db.select().from(schema.teacherObservations);
  for (const o of obs) {
    const ids = (o.feedbackIds as string[]).filter((x) => x !== id);
    if (ids.length === (o.feedbackIds as string[]).length) continue;
    if (!ids.length) await db.delete(schema.teacherObservations).where(eq(schema.teacherObservations.id, o.id));
    else await db.update(schema.teacherObservations).set({ feedbackIds: ids }).where(eq(schema.teacherObservations.id, o.id));
  }
}

/** Extracts teacher-specific expectations (quoted) from one feedback entry. */
export async function analyseTeacherFeedback(id: string) {
  const db = await getDb();
  const [fb] = await db.select().from(schema.teacherFeedback).where(eq(schema.teacherFeedback.id, id));
  if (!fb) throw notFound("Teacher feedback");
  const { system, user } = buildTeacherPrompt({ comments: fb.comments, criteria: fb.criteria, teacherScore: fb.teacherScore, taskType: fb.taskType });
  const { data } = await runAI({
    operation: "teacher_analysis", system, user, schema: TeacherAnalysisOutputSchema, effort: "low", maxTokens: 4000, relatedId: id,
    validate: (o) => validateTeacher(o, fb), mockContext: { comments: fb.comments, criteria: fb.criteria },
  });
  await db.update(schema.teacherFeedback).set({ analysis: data }).where(eq(schema.teacherFeedback.id, id));
  for (const o of data.observations) {
    const norm = normalizeLabel(o.statement);
    const [existing] = await db.select().from(schema.teacherObservations).where(eq(schema.teacherObservations.normalizedStatement, norm));
    if (existing) {
      const ids = [...new Set([...(existing.feedbackIds as string[]), id])];
      await db.update(schema.teacherObservations).set({ feedbackIds: ids, quotes: [...(existing.quotes as string[]), o.quote].slice(-6) }).where(eq(schema.teacherObservations.id, existing.id));
    } else {
      await db.insert(schema.teacherObservations).values({ statement: o.statement, normalizedStatement: norm, category: o.category, feedbackIds: [id], quotes: [o.quote] }).onConflictDoNothing();
    }
  }
  return data;
}

export type CalibrationPair = { essayId: string; title: string; taskType: string; teacherScore: number; estimate: number; low: number; high: number; diff: number };

export async function computeCalibration() {
  const db = await getDb();
  const fbs = await db.select().from(schema.teacherFeedback).orderBy(desc(schema.teacherFeedback.createdAt));
  const pairs: CalibrationPair[] = [];
  for (const fb of fbs) {
    if (!fb.essayId || fb.teacherScore === null) continue;
    if (pairs.some((p) => p.essayId === fb.essayId)) continue;
    const [a] = await db.select().from(schema.assessments)
      .where(and(eq(schema.assessments.essayId, fb.essayId), eq(schema.assessments.mode, "teacher_standard"), eq(schema.assessments.status, "completed")))
      .orderBy(desc(schema.assessments.createdAt)).limit(1);
    const [e] = await db.select({ title: schema.essays.title, taskType: schema.essays.taskType }).from(schema.essays).where(eq(schema.essays.id, fb.essayId));
    if (!a || a.scoreBest === null || !e) continue;
    pairs.push({ essayId: fb.essayId, title: e.title, taskType: e.taskType, teacherScore: fb.teacherScore, estimate: a.scoreBest, low: a.scoreLow ?? a.scoreBest, high: a.scoreHigh ?? a.scoreBest, diff: fb.teacherScore - a.scoreBest });
  }
  const n = pairs.length;
  const mean = n ? pairs.reduce((s, p) => s + p.diff, 0) / n : 0;
  const sd = n ? Math.sqrt(pairs.reduce((s, p) => s + (p.diff - mean) ** 2, 0) / n) : 0;
  const withinRange = pairs.filter((p) => p.teacherScore >= p.low && p.teacherScore <= p.high).length;
  let tendency: "not_enough_data" | "consistent_offset" | "aligned" | "inconsistent";
  if (n < 3) tendency = "not_enough_data";
  else if (sd > 1.5) tendency = "inconsistent";
  else if (Math.abs(mean) >= 1) tendency = "consistent_offset";
  else tendency = "aligned";
  const offset = n >= 3 && sd <= 2 ? Math.round(mean * 2) / 2 : 0;
  const byTaskType: Record<string, { n: number; mean: number }> = {};
  for (const p of pairs) {
    byTaskType[p.taskType] ??= { n: 0, mean: 0 };
    byTaskType[p.taskType].n += 1;
    byTaskType[p.taskType].mean += p.diff;
  }
  for (const k of Object.keys(byTaskType)) byTaskType[k].mean = Math.round((byTaskType[k].mean / byTaskType[k].n) * 10) / 10;
  const observations = await db.select().from(schema.teacherObservations).where(isNull(schema.teacherObservations.dismissedAt));
  return {
    pairs, n, meanOffset: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10, withinRange, tendency, appliedOffset: offset, byTaskType,
    observations: observations.map((o) => ({ ...o, support: (o.feedbackIds as string[]).length, strength: (o.feedbackIds as string[]).length >= 2 ? "repeated" : "single observation" })),
  };
}

export async function calibrationSummaryForPrompt(taskType: TaskTypeKey) {
  const c = await computeCalibration();
  const lines: string[] = [];
  if (c.n === 0) lines.push("No essays with both a teacher score and a teacher-standard estimate yet.");
  else {
    lines.push(`${c.n} essay(s) have both a teacher score and an estimate. Mean difference (teacher − estimate): ${c.meanOffset} points, spread ${c.sd}. Tendency: ${c.tendency.replace(/_/g, " ")}.`);
    const t = c.byTaskType[taskType];
    if (t) lines.push(`For ${TASK_TYPES[taskType].label}: ${t.n} essay(s), mean difference ${t.mean}.`);
    if (c.n < 3) lines.push("Too few pairs to draw conclusions; do not adjust for them.");
  }
  if (c.observations.length) {
    lines.push("Teacher-specific expectations extracted from the student's teacher feedback (not official rules):");
    for (const o of c.observations.slice(0, 12)) lines.push(`- ${o.statement} (${o.strength}; e.g. "${(o.quotes as string[])[0] ?? ""}")`);
  }
  return lines.join("\n");
}

export async function dismissTeacherObservation(id: string) {
  const db = await getDb();
  await db.update(schema.teacherObservations).set({ dismissedAt: new Date() }).where(eq(schema.teacherObservations.id, id));
}
