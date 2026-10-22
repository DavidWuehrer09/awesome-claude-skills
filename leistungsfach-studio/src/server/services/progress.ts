import "server-only";
import { desc, eq, isNull } from "drizzle-orm";
import { runAI } from "@/lib/ai/client";
import { ProgressReviewOutputSchema, type AssessmentOutput } from "@/lib/ai/schemas";
import { buildProgressPrompt, validateProgressReview } from "@/lib/ai/prompts/misc";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/types";
import { DIMENSIONS, type AssessmentMode, type DimensionKey, type TaskTypeKey } from "@/lib/curriculum";
import { comparisonCaveats, type ComparableAssessment } from "@/lib/progress/caveats";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { getDb, schema } from "@/server/db/client";
import { AppError } from "@/server/http";
import { getLearnerOverview } from "./learner";
import { duePatternReviews, getPriorities } from "./training";

export async function getDashboard() {
  const db = await getDb();
  const rows = await db.select({ a: schema.assessments, e: schema.essays }).from(schema.assessments)
    .innerJoin(schema.essays, eq(schema.essays.id, schema.assessments.essayId))
    .where(eq(schema.assessments.status, "completed")).orderBy(schema.assessments.createdAt);

  const timeline = rows.map(({ a, e }) => ({
    assessmentId: a.id, essayId: e.id, title: e.title, taskType: e.taskType as TaskTypeKey, mode: a.mode as AssessmentMode, context: e.context,
    date: (e.writtenAt ?? e.createdAt).toISOString(), assessedAt: a.createdAt.toISOString(),
    low: a.scoreLow ?? 0, high: a.scoreHigh ?? 0, best: a.scoreBest ?? 0, content: a.contentScore, language: a.languageScore,
    confidence: (a.confidence ?? "medium") as ComparableAssessment["confidence"], provider: a.provider,
  }));
  const comparables: ComparableAssessment[] = rows.map(({ a, e }) => ({
    taskType: e.taskType as TaskTypeKey, mode: a.mode as AssessmentMode, low: a.scoreLow ?? 0, high: a.scoreHigh ?? 0, best: a.scoreBest ?? 0,
    confidence: (a.confidence ?? "medium") as ComparableAssessment["confidence"], hasTaskPrompt: Boolean(e.taskPrompt.trim()), hasSourceText: Boolean(e.sourceText.trim()),
    wordCount: e.wordCount, timed: Boolean(e.timeLimitMinutes), promptVersion: a.promptVersion,
  }));

  // Latest teacher-standard (or latest any-mode) assessment per essay, for per-dimension stats.
  const perEssay = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = perEssay.get(r.e.id);
    if (!cur || r.a.mode === "teacher_standard" || cur.a.mode !== "teacher_standard") perEssay.set(r.e.id, r);
  }
  const dimAgg = new Map<DimensionKey, { sum: number; n: number; recent: number[] }>();
  for (const r of perEssay.values()) {
    for (const d of (r.a.result as AssessmentOutput).dimensions) {
      const cur = dimAgg.get(d.key) ?? { sum: 0, n: 0, recent: [] };
      cur.sum += d.best; cur.n += 1; cur.recent.push(d.best);
      dimAgg.set(d.key, cur);
    }
  }
  const dimensions = [...dimAgg.entries()].map(([key, v]) => ({
    key, label: DIMENSIONS[key].label, group: DIMENSIONS[key].group, mean: Math.round((v.sum / v.n) * 10) / 10, n: v.n,
    latest: v.recent[v.recent.length - 1], first: v.recent[0],
  })).sort((a, b) => a.mean - b.mean);

  const latestPairCaveats = comparables.length >= 2 ? comparisonCaveats(comparables[comparables.length - 2], comparables[comparables.length - 1]) : [];

  const overview = await getLearnerOverview();
  const skills = overview.skills.map((s) => ({ key: s.key, label: s.label, level: s.level, confidence: s.confidence, trend: s.trend, masteryStatus: s.masteryStatus, masteryLabel: s.masteryLabel, sourceCount: s.sourceCount, recommendedAction: s.recommendedAction }));
  const improving = skills.filter((s) => s.trend === "improving");
  const attention = skills.filter((s) => s.masteryStatus === "recurring_weakness" || (s.level !== null && s.level < 9) || s.trend === "declining")
    .sort((a, b) => (a.level ?? 99) - (b.level ?? 99)).slice(0, 5);
  const recurring = overview.patterns.filter((p) => !p.dismissedAt && (p.status === "recurring" || p.status === "improving"))
    .map((p) => ({ id: p.id, label: p.label, category: p.category, status: p.status, skillKey: p.skillKey, submissions: new Set((p.occurrences as { submissionKey: string }[]).map((o) => o.submissionKey)).size }));

  const attempts = await db.select({ outcome: schema.exerciseAttempts.outcome, status: schema.exerciseAttempts.status, skillKey: schema.exercises.skillKey, isTransfer: schema.exercises.isTransfer })
    .from(schema.exerciseAttempts).innerJoin(schema.exercises, eq(schema.exercises.id, schema.exerciseAttempts.exerciseId));
  const evaluated = attempts.filter((a) => a.status === "evaluated");
  const exercises = {
    attempted: attempts.length, evaluated: evaluated.length,
    correct: evaluated.filter((a) => a.outcome === "correct").length, partial: evaluated.filter((a) => a.outcome === "partial").length, incorrect: evaluated.filter((a) => a.outcome === "incorrect").length,
    transfer: evaluated.filter((a) => a.isTransfer).length,
    bySkill: Object.entries(evaluated.reduce<Record<string, { n: number; correct: number }>>((m, a) => {
      m[a.skillKey] ??= { n: 0, correct: 0 }; m[a.skillKey].n++; if (a.outcome === "correct") m[a.skillKey].correct++; return m;
    }, {})).map(([k, v]) => ({ skillKey: k, label: SKILLS[k as SkillKey]?.label ?? k, ...v })),
  };

  const vocabRows = await db.select({ status: schema.vocabEntries.status, nextReviewAt: schema.vocabEntries.nextReviewAt }).from(schema.vocabEntries);
  const now = Date.now();
  const vocab = {
    total: vocabRows.length,
    learned: vocabRows.filter((v) => v.status === "used_correctly" || v.status === "secure").length,
    secure: vocabRows.filter((v) => v.status === "secure").length,
    due: vocabRows.filter((v) => v.nextReviewAt && v.nextReviewAt.getTime() <= now).length,
  };

  const examSims = timeline.filter((t) => t.context === "exam_simulation");
  const essaysAll = await db.select({ id: schema.essays.id, context: schema.essays.context, timeLimitMinutes: schema.essays.timeLimitMinutes, timeUsedMinutes: schema.essays.timeUsedMinutes, title: schema.essays.title }).from(schema.essays);
  const examSimulations = essaysAll.filter((e) => e.context === "exam_simulation").map((e) => {
    const t = examSims.filter((x) => x.essayId === e.id).pop();
    return { essayId: e.id, title: e.title, timeLimitMinutes: e.timeLimitMinutes, timeUsedMinutes: e.timeUsedMinutes, low: t?.low ?? null, high: t?.high ?? null };
  });

  const [priorities, duePatterns] = await Promise.all([getPriorities(), duePatternReviews()]);
  const [latestReview] = await db.select().from(schema.progressReviews).orderBy(desc(schema.progressReviews.createdAt)).limit(1);
  const essayCount = essaysAll.length;
  const teacherCount = (await db.select({ id: schema.teacherFeedback.id }).from(schema.teacherFeedback).where(isNull(schema.teacherFeedback.analysis))).length;

  return {
    essayCount, timeline, dimensions, latestPairCaveats, skills, improving, attention, recurring,
    exercises, vocab, examSimulations, priorities, duePatterns: duePatterns.map((p) => ({ id: p.id, label: p.label, skillKey: p.skillKey })),
    latestReview: latestReview ?? null, unanalysedTeacherFeedback: teacherCount,
  };
}

export async function compareTwo(assessmentA: string, assessmentB: string) {
  const d = await getDb();
  const load = async (id: string) => {
    const [r] = await d.select({ a: schema.assessments, e: schema.essays }).from(schema.assessments).innerJoin(schema.essays, eq(schema.essays.id, schema.assessments.essayId)).where(eq(schema.assessments.id, id));
    return r;
  };
  const [x, y] = await Promise.all([load(assessmentA), load(assessmentB)]);
  if (!x || !y) throw new AppError("not_found", "Assessment not found.", 404);
  const toC = (r: typeof x): ComparableAssessment => ({ taskType: r.e.taskType as TaskTypeKey, mode: r.a.mode as AssessmentMode, low: r.a.scoreLow ?? 0, high: r.a.scoreHigh ?? 0, best: r.a.scoreBest ?? 0, confidence: (r.a.confidence ?? "medium") as ComparableAssessment["confidence"], hasTaskPrompt: Boolean(r.e.taskPrompt.trim()), hasSourceText: Boolean(r.e.sourceText.trim()), wordCount: r.e.wordCount, timed: Boolean(r.e.timeLimitMinutes), promptVersion: r.a.promptVersion });
  return comparisonCaveats(toC(x), toC(y));
}

export async function generateProgressReview() {
  const dash = await getDashboard();
  if (dash.timeline.length === 0 && dash.exercises.evaluated === 0) throw new AppError("no_data", "There is nothing to review yet — assess an essay or complete an exercise first.", 400);
  const stats = {
    essays_assessed: new Set(dash.timeline.map((t) => t.essayId)).size,
    assessments: dash.timeline.map((t) => ({ date: t.date.slice(0, 10), task_type: t.taskType, mode: t.mode, range: `${t.low}-${t.high}`, best: t.best, confidence: t.confidence })),
    dimensions_mean: dash.dimensions.map((d) => ({ dimension: d.key, mean: d.mean, essays: d.n })),
    skills: dash.skills.filter((s) => s.level !== null).map((s) => ({ skill: s.key, level: s.level, confidence: s.confidence, trend: s.trend, status: s.masteryStatus })),
    recurring_errors: dash.recurring.map((r) => ({ label: r.label, status: r.status, submissions: r.submissions })),
    exercises: { evaluated: dash.exercises.evaluated, correct: dash.exercises.correct, partial: dash.exercises.partial, incorrect: dash.exercises.incorrect, transfer: dash.exercises.transfer },
    vocabulary: dash.vocab,
  };
  const { system, user } = buildProgressPrompt(stats, dash.latestPairCaveats);
  try {
    const { data, provider } = await runAI({ operation: "progress_review", system, user, schema: ProgressReviewOutputSchema, effort: "medium", maxTokens: 6000, validate: (o) => validateProgressReview(o, stats), mockContext: { stats } });
    const db = await getDb();
    const [row] = await db.insert(schema.progressReviews).values({ stats, result: data, provider }).returning();
    return row;
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502);
  }
}
