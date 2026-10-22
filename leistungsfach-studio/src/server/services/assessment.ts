import "server-only";
import { desc, eq } from "drizzle-orm";
import { runAI } from "@/lib/ai/client";
import { AssessmentOutputSchema } from "@/lib/ai/schemas";
import { ASSESSMENT_PROMPT_VERSION, buildAssessmentPrompt, validateAssessment } from "@/lib/ai/prompts/assessment";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/types";
import { TASK_TYPES, taskTypeDimensions, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import { aggregateScore } from "@/lib/scoring/aggregate";
import { getDb, schema } from "@/server/db/client";
import { AppError, notFound } from "@/server/http";
import { log } from "@/server/log";
import { getEssay } from "./essays";
import { getProfile } from "./profile";
import { applyAssessmentLearnerUpdate, learnerSummaryForPrompt } from "./learner";
import { calibrationSummaryForPrompt, computeCalibration } from "./calibration";
import { verifiedNotesFor } from "./curriculum";

/**
 * Assess a saved essay. The essay row already exists, so nothing the student wrote can be lost.
 * Success → new completed assessment row (+ learner update). Failure → new failed row with the reason.
 */
export async function assessEssay(essayId: string, mode: AssessmentMode) {
  const db = await getDb();
  const essay = await getEssay(essayId);
  const taskType = essay.taskType as TaskTypeKey;
  const profile = await getProfile();
  const [learnerSummary, teacherCalibration, verifiedNotes] = await Promise.all([
    learnerSummaryForPrompt(),
    mode === "teacher_standard" ? calibrationSummaryForPrompt(taskType) : Promise.resolve(""),
    verifiedNotesFor(taskType),
  ]);
  const t = TASK_TYPES[taskType];
  const missingMaterial = !essay.taskPrompt.trim() || (t.needsSourceText && !essay.sourceText.trim());
  const { system, user } = buildAssessmentPrompt({
    mode, taskType, operator: essay.operator, taskPrompt: essay.taskPrompt, sourceText: essay.sourceText, essayText: essay.essayText,
    rubricText: essay.rubricText, wordCount: essay.wordCount, context: essay.context, timeLimitMinutes: essay.timeLimitMinutes,
    timeUsedMinutes: essay.timeUsedMinutes, learnerSummary, teacherCalibration, verifiedNotes,
  });

  try {
    const { data, provider, model } = await runAI({
      operation: "assessment", system, user, schema: AssessmentOutputSchema, effort: "high", maxTokens: 32000, relatedId: essayId,
      validate: (o) => validateAssessment(o, { taskType, essayText: essay.essayText, sourceText: essay.sourceText, taskPrompt: essay.taskPrompt }),
      mockContext: { essayText: essay.essayText, dimensions: taskTypeDimensions(taskType), missingMaterial },
    });
    const agg = aggregateScore(data.dimensions, taskType, { useReportedWeighting: profile.useReportedWeighting });
    const warnings: string[] = [];
    const hMid = (data.holistic_check.low + data.holistic_check.high) / 2;
    if (Math.abs(hMid - agg.best) > 3) warnings.push(`The examiner's holistic impression (${data.holistic_check.low}–${data.holistic_check.high}) differs from the computed score by more than 3 points; treat this estimate with extra caution.`);

    let calibration: Record<string, unknown> | null = null;
    if (mode === "teacher_standard") {
      const c = await computeCalibration();
      if (c.appliedOffset !== 0) {
        const clamp = (n: number) => Math.max(0, Math.min(15, n));
        calibration = {
          n: c.n, offset: c.appliedOffset, sd: c.sd, tendency: c.tendency,
          low: clamp(Math.floor(agg.low + c.appliedOffset)), best: clamp(Math.round(agg.best + c.appliedOffset)), high: clamp(Math.ceil(agg.high + c.appliedOffset)),
          note: `Adjusted by ${c.appliedOffset > 0 ? "+" : ""}${c.appliedOffset} based on ${c.n} essays your teacher marked (spread ${c.sd}). Teacher-specific, not official.`,
        };
      } else {
        calibration = { n: c.n, offset: 0, tendency: c.tendency, note: c.n < 3 ? `Calibration needs at least 3 teacher-marked essays (you have ${c.n}).` : "No consistent offset between your teacher's marks and the estimates." };
      }
    }

    const [row] = await db.insert(schema.assessments).values({
      essayId, mode, status: "completed",
      scoreLow: agg.low, scoreHigh: agg.high, scoreBest: agg.best,
      contentScore: agg.content?.best ?? null, languageScore: agg.language?.best ?? null,
      confidence: data.confidence, aggregation: { ...agg, warnings }, result: data, calibration,
      provider, model, promptVersion: ASSESSMENT_PROMPT_VERSION,
    }).returning();

    let learnerUpdate: { ok: boolean; error?: string; observations?: number } = { ok: true };
    try {
      const r = await applyAssessmentLearnerUpdate(row.id);
      learnerUpdate = { ok: true, observations: r.observations };
    } catch (err) {
      const message = err instanceof AIError ? AI_ERROR_MESSAGES[err.code] : "The learner profile could not be updated.";
      log.warn("learner.update_failed", { assessmentId: row.id, error: String(err) });
      learnerUpdate = { ok: false, error: `${message} The assessment itself was saved; you can retry the profile update from the essay page.` };
    }
    return { assessment: row, learnerUpdate };
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    const [failed] = await db.insert(schema.assessments).values({
      essayId, mode, status: "failed", errorCode: e.code, errorMessage: AI_ERROR_MESSAGES[e.code], provider: null, promptVersion: ASSESSMENT_PROMPT_VERSION,
    }).returning();
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502, { assessmentId: failed.id, validationErrors: e.validationErrors.slice(0, 5) });
  }
}

export async function getAssessment(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, id));
  if (!a) throw notFound("Assessment");
  return a;
}

export async function latestCompletedAssessment(essayId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.assessments).where(eq(schema.assessments.essayId, essayId)).orderBy(desc(schema.assessments.createdAt));
  return rows.find((r) => r.status === "completed") ?? null;
}

export async function retryLearnerUpdate(assessmentId: string) {
  return applyAssessmentLearnerUpdate(assessmentId);
}
