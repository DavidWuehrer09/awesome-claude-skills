import "server-only";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/server/db/client";
import { AppError } from "@/server/http";

const TABLES = {
  learner_profile: schema.learnerProfile,
  essays: schema.essays,
  assessments: schema.assessments,
  revisions: schema.revisions,
  revision_explanations: schema.revisionExplanations,
  skill_states: schema.skillStates,
  skill_evidence: schema.skillEvidence,
  error_patterns: schema.errorPatterns,
  exercises: schema.exercises,
  exercise_attempts: schema.exerciseAttempts,
  vocab_entries: schema.vocabEntries,
  vocab_reviews: schema.vocabReviews,
  teacher_feedback: schema.teacherFeedback,
  teacher_observations: schema.teacherObservations,
  curriculum_notes: schema.curriculumNotes,
  progress_reviews: schema.progressReviews,
  ai_runs: schema.aiRuns,
} as const;

export async function exportAll() {
  const db = await getDb();
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(TABLES)) out[name] = await db.select().from(table);
  return { exportedAt: new Date().toISOString(), app: "leistungsfach-studio", schemaVersion: 1, data: out };
}

/** Irreversible full reset. Requires the exact confirmation phrase. */
export async function resetAll(confirmation: string) {
  if (confirmation !== "DELETE ALL MY DATA") throw new AppError("confirmation_required", 'Type "DELETE ALL MY DATA" to confirm.', 400);
  const db = await getDb();
  await db.transaction(async (tx) => {
    // children first
    for (const t of [schema.vocabReviews, schema.revisionExplanations, schema.exerciseAttempts, schema.exercises, schema.revisions, schema.assessments, schema.teacherFeedback, schema.teacherObservations, schema.skillEvidence, schema.errorPatterns, schema.skillStates, schema.vocabEntries, schema.curriculumNotes, schema.progressReviews, schema.aiRuns, schema.essays, schema.learnerProfile]) {
      await tx.delete(t);
    }
  });
}

export async function recentAiRuns(limit = 30) {
  const db = await getDb();
  return db.select().from(schema.aiRuns).orderBy(desc(schema.aiRuns.createdAt)).limit(limit);
}
