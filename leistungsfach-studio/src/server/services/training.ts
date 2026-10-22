import "server-only";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { runAI } from "@/lib/ai/client";
import {
  DIFFICULTIES, EXERCISE_TYPES, ExerciseEvaluationOutputSchema, ExerciseOutputSchema,
  type AssessmentOutput, type Difficulty, type ExerciseOutput, type ExerciseType,
} from "@/lib/ai/schemas";
import {
  buildExerciseEvaluationPrompt, buildExerciseGenerationPrompt, validateExercise, validateExerciseEvaluation,
} from "@/lib/ai/prompts/exercises";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/types";
import type { TaskTypeKey } from "@/lib/curriculum";
import { selectPriorities, type SkillSnapshot } from "@/lib/learner/priorities";
import type { MasteryStatus } from "@/lib/learner/model";
import { SKILL_KEYS, SKILLS, type SkillKey } from "@/lib/learner/skills";
import { scheduleNext } from "@/lib/learner/spaced";
import { getDb, schema } from "@/server/db/client";
import { AppError, notFound } from "@/server/http";
import { addObservations, recomputeSkill, recordPatternClean, recordPatternOccurrence } from "./learner";

const DEFAULT_TYPE: Record<SkillKey, ExerciseType> = {
  analytical_depth: "device_analysis", purpose_effect: "device_analysis", evidence_integration: "evidence_interpretation",
  argument_development: "sentence_improvement", paragraph_structure: "paragraph_reconstruction", intro_conclusion: "paragraph_reconstruction",
  cohesion_transitions: "paragraph_reconstruction", vocabulary_precision: "sentence_improvement", idiomatic_collocations: "collocation",
  grammar_variety: "grammar", register_conventions: "sentence_improvement", time_management: "timed_task", operator_fulfilment: "diagnostic",
  comprehension_accuracy: "diagnostic",
};

export async function getPriorities() {
  const db = await getDb();
  const states = await db.select().from(schema.skillStates);
  const lastTrained = await db.select({ skillKey: schema.exercises.skillKey, at: sql<string>`max(${schema.exercises.createdAt})` })
    .from(schema.exercises).groupBy(schema.exercises.skillKey);
  const patterns = await db.select().from(schema.errorPatterns).where(and(isNull(schema.errorPatterns.dismissedAt), eq(schema.errorPatterns.status, "recurring")));
  const [latest] = await db.select({ result: schema.assessments.result, essayId: schema.assessments.essayId, taskType: schema.essays.taskType, title: schema.essays.title })
    .from(schema.assessments).innerJoin(schema.essays, eq(schema.essays.id, schema.assessments.essayId))
    .where(eq(schema.assessments.status, "completed")).orderBy(desc(schema.assessments.createdAt)).limit(1);
  const skills: SkillSnapshot[] = states.map((s) => ({
    skillKey: s.skillKey as SkillKey, level: s.level, confidence: s.confidence, masteryStatus: s.masteryStatus as MasteryStatus,
    lastTrainedAt: (() => { const t = lastTrained.find((l) => l.skillKey === s.skillKey)?.at; return t ? new Date(t) : null; })(),
  }));
  const recurringBySkill: Partial<Record<SkillKey, number>> = {};
  for (const p of patterns) recurringBySkill[p.skillKey as SkillKey] = (recurringBySkill[p.skillKey as SkillKey] ?? 0) + 1;
  const actionPlan = ((latest?.result as AssessmentOutput | undefined)?.action_plan ?? []).map((a) => ({ skillKey: a.skill_key, priority: a.priority }));
  const priorities = selectPriorities({ skills, taskType: (latest?.taskType as TaskTypeKey) ?? null, actionPlan, recurringBySkill });
  return {
    basedOn: latest ? { essayId: latest.essayId, title: latest.title } : null,
    priorities: priorities.map((p) => ({ ...p, label: SKILLS[p.skillKey].label, suggestedType: DEFAULT_TYPE[p.skillKey] })),
  };
}

export const GenerateExerciseInput = z.object({
  skillKey: z.enum(SKILL_KEYS),
  type: z.enum(EXERCISE_TYPES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  isTransfer: z.boolean().optional(),
  errorPatternId: z.string().nullable().optional(),
  sourceEssayId: z.string().nullable().optional(),
  timeLimitMinutes: z.number().int().min(3).max(120).nullable().optional(),
  reason: z.string().max(500).optional(),
});

async function adaptiveDifficulty(skillKey: SkillKey): Promise<Difficulty> {
  const db = await getDb();
  const recent = await db.select({ outcome: schema.exerciseAttempts.outcome, difficulty: schema.exercises.difficulty })
    .from(schema.exerciseAttempts).innerJoin(schema.exercises, eq(schema.exercises.id, schema.exerciseAttempts.exerciseId))
    .where(and(eq(schema.exercises.skillKey, skillKey), eq(schema.exerciseAttempts.status, "evaluated")))
    .orderBy(desc(schema.exerciseAttempts.createdAt)).limit(2);
  const [state] = await db.select().from(schema.skillStates).where(eq(schema.skillStates.skillKey, skillKey));
  const fromLevel: Difficulty = state?.level == null ? "core" : state.level < 7 ? "foundation" : state.level < 11 ? "core" : state.level < 13 ? "stretch" : "exam";
  if (recent.length < 2) return fromLevel;
  const idx = DIFFICULTIES.indexOf(recent[0].difficulty as Difficulty);
  if (recent.every((r) => r.outcome === "correct")) return DIFFICULTIES[Math.min(DIFFICULTIES.length - 1, idx + 1)];
  if (recent.every((r) => r.outcome === "incorrect")) return DIFFICULTIES[Math.max(0, idx - 1)];
  return DIFFICULTIES[idx] ?? fromLevel;
}

export async function generateExercise(input: z.infer<typeof GenerateExerciseInput>) {
  const db = await getDb();
  const skillKey = input.skillKey;
  const [state] = await db.select().from(schema.skillStates).where(eq(schema.skillStates.skillKey, skillKey));
  const type = input.type ?? (state && state.level !== null && state.confidence < 0.3 ? "diagnostic" : DEFAULT_TYPE[skillKey]);
  const difficulty = input.difficulty ?? (type === "timed_task" ? "exam" : await adaptiveDifficulty(skillKey));
  const isTransfer = input.isTransfer ?? type === "transfer";
  const timeLimitMinutes = input.timeLimitMinutes ?? (type === "timed_task" ? 15 : null);

  let pattern: typeof schema.errorPatterns.$inferSelect | undefined;
  if (input.errorPatternId) {
    [pattern] = await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.id, input.errorPatternId));
    if (!pattern) throw notFound("Error pattern");
  } else {
    [pattern] = await db.select().from(schema.errorPatterns)
      .where(and(eq(schema.errorPatterns.skillKey, skillKey), isNull(schema.errorPatterns.dismissedAt), eq(schema.errorPatterns.status, "recurring")))
      .orderBy(desc(schema.errorPatterns.updatedAt)).limit(1);
  }
  const weakQuotes = await db.select({ quote: schema.skillEvidence.quote }).from(schema.skillEvidence)
    .where(and(eq(schema.skillEvidence.skillKey, skillKey), eq(schema.skillEvidence.polarity, "weakness"), isNull(schema.skillEvidence.dismissedAt)))
    .orderBy(desc(schema.skillEvidence.createdAt)).limit(5);
  let topicHint = "";
  if (!isTransfer && input.sourceEssayId) {
    const [e] = await db.select({ title: schema.essays.title }).from(schema.essays).where(eq(schema.essays.id, input.sourceEssayId));
    topicHint = e?.title ?? "";
  }
  const reason = input.reason || (pattern ? `Recurring pattern: ${pattern.label}` : `Practice for ${SKILLS[skillKey].label}`);
  const { system, user } = buildExerciseGenerationPrompt({
    skill: skillKey, type, difficulty, isTransfer, timeLimitMinutes, reason,
    patternLabel: pattern?.label ?? null,
    patternExamples: ((pattern?.occurrences as { quote: string }[] | undefined) ?? []).slice(-4).map((o) => o.quote),
    studentSentences: weakQuotes.map((q) => q.quote).filter(Boolean), topicHint,
  });
  try {
    const { data, provider } = await runAI({
      operation: "exercise_generation", system, user, schema: ExerciseOutputSchema, effort: "medium", maxTokens: 8000,
      validate: validateExercise, mockContext: { skill: skillKey, type },
    });
    const [row] = await db.insert(schema.exercises).values({
      skillKey, errorPatternId: pattern?.id ?? null, sourceEssayId: input.sourceEssayId ?? null, type, difficulty, isTransfer, timeLimitMinutes,
      content: data, reason, provider,
    }).returning();
    return publicExercise(row, []);
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502);
  }
}

type ExerciseRow = typeof schema.exercises.$inferSelect;
type AttemptRow = typeof schema.exerciseAttempts.$inferSelect;

/** Hides the model answer and answer key until the student has submitted an attempt. */
export function publicExercise(row: ExerciseRow, attempts: AttemptRow[]) {
  const content = row.content as ExerciseOutput;
  const revealed = attempts.some((a) => a.status === "evaluated" || a.status === "evaluation_failed");
  const { model_answer, answer_key, ...visible } = content;
  return {
    ...row,
    content: revealed ? content : { ...visible, model_answer: null, answer_key: null },
    revealed, attempts, hidden: revealed ? null : { modelAnswerHidden: Boolean(model_answer), keyItems: answer_key.length },
  };
}

export async function getExercise(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, id));
  if (!row) throw notFound("Exercise");
  const attempts = await db.select().from(schema.exerciseAttempts).where(eq(schema.exerciseAttempts.exerciseId, id)).orderBy(desc(schema.exerciseAttempts.createdAt));
  return publicExercise(row, attempts);
}

export async function listExercises() {
  const db = await getDb();
  const rows = await db.select().from(schema.exercises).orderBy(desc(schema.exercises.createdAt)).limit(200);
  const attempts = await db.select().from(schema.exerciseAttempts).orderBy(desc(schema.exerciseAttempts.createdAt));
  return rows.map((r) => {
    const a = attempts.filter((x) => x.exerciseId === r.id);
    const c = r.content as ExerciseOutput;
    return { id: r.id, skillKey: r.skillKey, type: r.type, difficulty: r.difficulty, isTransfer: r.isTransfer, title: c.title, status: r.status, createdAt: r.createdAt, provider: r.provider, latestOutcome: a.find((x) => x.outcome)?.outcome ?? null, attemptCount: a.length };
  });
}

export const AttemptInput = z.object({
  answer: z.string().trim().min(1, "Write an answer first.").max(20000),
  timeUsedSeconds: z.number().int().min(0).max(36000).nullable().default(null),
});

export async function submitAttempt(exerciseId: string, input: z.infer<typeof AttemptInput>) {
  const db = await getDb();
  const [ex] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, exerciseId));
  if (!ex) throw notFound("Exercise");
  // Save the answer first: evaluation failures must never lose it.
  const [attempt] = await db.insert(schema.exerciseAttempts).values({ exerciseId, answer: input.answer, timeUsedSeconds: input.timeUsedSeconds, status: "submitted" }).returning();
  await db.update(schema.exercises).set({ status: "attempted" }).where(eq(schema.exercises.id, exerciseId));
  return evaluateAttempt(attempt.id);
}

export async function evaluateAttempt(attemptId: string) {
  const db = await getDb();
  const [attempt] = await db.select().from(schema.exerciseAttempts).where(eq(schema.exerciseAttempts.id, attemptId));
  if (!attempt) throw notFound("Attempt");
  const [ex] = await db.select().from(schema.exercises).where(eq(schema.exercises.id, attempt.exerciseId));
  const content = ex.content as ExerciseOutput;
  const skill = ex.skillKey as SkillKey;
  const { system, user } = buildExerciseEvaluationPrompt({ exercise: content, skill, difficulty: ex.difficulty, answer: attempt.answer, timeLimitMinutes: ex.timeLimitMinutes, timeUsedSeconds: attempt.timeUsedSeconds });
  try {
    const { data } = await runAI({
      operation: "exercise_evaluation", system, user, schema: ExerciseEvaluationOutputSchema, effort: "medium", maxTokens: 8000, relatedId: attemptId,
      validate: (o) => validateExerciseEvaluation(o, { answer: attempt.answer, itemIds: content.items.map((i) => i.id) }),
      mockContext: { answer: attempt.answer, itemIds: content.items.map((i) => i.id), skill },
    });
    await db.update(schema.exerciseAttempts).set({ status: "evaluated", outcome: data.outcome, score: data.score, feedback: data, errorMessage: null, evaluatedAt: new Date() })
      .where(eq(schema.exerciseAttempts.id, attemptId));

    const src = { sourceType: "exercise" as const, sourceId: attemptId, submissionKey: `attempt:${attemptId}`, essayId: null, isTransfer: ex.isTransfer };
    await db.update(schema.skillEvidence).set({ dismissedAt: new Date(), dismissedReason: "Superseded by re-evaluation" })
      .where(and(eq(schema.skillEvidence.sourceId, attemptId), isNull(schema.skillEvidence.dismissedAt)));
    await addObservations(data.observations, src);
    if (ex.timeLimitMinutes && attempt.timeUsedSeconds != null) {
      const ratio = attempt.timeUsedSeconds / 60 / ex.timeLimitMinutes;
      await addObservations([{ skill_key: "time_management", polarity: ratio <= 1 ? "strength" : "weakness", quote: "", note: `Derived from time used in a timed exercise (${Math.round(attempt.timeUsedSeconds / 60)} of ${ex.timeLimitMinutes} min).`, level_estimate: ratio <= 1 ? 12 : ratio <= 1.1 ? 9 : 6 }], src);
    }
    if (ex.errorPatternId) {
      const [p] = await db.select().from(schema.errorPatterns).where(eq(schema.errorPatterns.id, ex.errorPatternId));
      if (p) {
        const at = new Date().toISOString();
        if (data.outcome === "correct") await recordPatternClean(p.id, { submissionKey: src.submissionKey, at, isTransfer: ex.isTransfer });
        else if (data.outcome === "incorrect") await recordPatternOccurrence({ patternId: p.id, label: p.label, category: p.category, skillKey: p.skillKey as SkillKey, explanation: p.explanation, occurrence: { submissionKey: src.submissionKey, at, quote: attempt.answer.slice(0, 160), correction: data.corrected_version ?? "", sourceType: "exercise" } });
        const s = scheduleNext(p.reviewIntervalDays, data.outcome);
        await db.update(schema.errorPatterns).set({ reviewIntervalDays: s.intervalDays, nextReviewAt: s.nextReviewAt }).where(eq(schema.errorPatterns.id, p.id));
      }
    }
    await recomputeSkill(skill);
    if (data.observations.some((o) => o.skill_key !== skill) || ex.timeLimitMinutes) {
      for (const k of new Set(data.observations.map((o) => o.skill_key))) if (k !== skill) await recomputeSkill(k);
      if (ex.timeLimitMinutes) await recomputeSkill("time_management");
    }
    return getExercise(ex.id);
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    await db.update(schema.exerciseAttempts).set({ status: "evaluation_failed", errorMessage: AI_ERROR_MESSAGES[e.code] }).where(eq(schema.exerciseAttempts.id, attemptId));
    throw new AppError(`ai_${e.code}`, `${AI_ERROR_MESSAGES[e.code]} Your answer was saved.`, e.code === "not_configured" ? 503 : 502, { attemptId });
  }
}

export async function duePatternReviews(now = new Date()) {
  const db = await getDb();
  return db.select().from(schema.errorPatterns)
    .where(and(isNull(schema.errorPatterns.dismissedAt), lte(schema.errorPatterns.nextReviewAt, now), sql`${schema.errorPatterns.status} in ('recurring','improving')`))
    .orderBy(schema.errorPatterns.nextReviewAt);
}
