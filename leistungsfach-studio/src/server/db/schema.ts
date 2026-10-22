import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Single-row profile and settings for the one learner using this installation. */
export const learnerProfile = pgTable("learner_profile", {
  id: text("id").primaryKey().default("me"),
  displayName: text("display_name").notNull().default(""),
  yearLevel: integer("year_level").notNull().default(12),
  targetPoints: integer("target_points").notNull().default(15),
  defaultMode: text("default_mode").notNull().default("teacher_standard"),
  useReportedWeighting: boolean("use_reported_weighting").notNull().default(true),
  goals: text("goals").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A submitted piece of writing. The text is immutable once saved; resubmissions create a new row with parentEssayId. */
export const essays = pgTable("essays", {
  id: id(),
  title: text("title").notNull(),
  taskType: text("task_type").notNull(),
  operator: text("operator").notNull().default(""),
  taskPrompt: text("task_prompt").notNull().default(""),
  sourceText: text("source_text").notNull().default(""),
  essayText: text("essay_text").notNull(),
  wordCount: integer("word_count").notNull(),
  rubricText: text("rubric_text").notNull().default(""),
  context: text("context").notNull().default("practice"), // practice | homework | classwork | exam_simulation
  timeLimitMinutes: integer("time_limit_minutes"),
  timeUsedMinutes: integer("time_used_minutes"),
  parentEssayId: text("parent_essay_id"),
  writtenAt: timestamp("written_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("essays_created_idx").on(t.createdAt)]);

export const assessments = pgTable("assessments", {
  id: id(),
  essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  status: text("status").notNull(), // completed | failed
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  scoreLow: real("score_low"),
  scoreHigh: real("score_high"),
  scoreBest: real("score_best"),
  contentScore: real("content_score"),
  languageScore: real("language_score"),
  confidence: text("confidence"),
  aggregation: jsonb("aggregation"), // AggregateResult (method, notes, cap applied …)
  result: jsonb("result"), // validated AssessmentOutput
  calibration: jsonb("calibration"), // calibration snapshot used / applied
  provider: text("provider"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
}, (t) => [index("assessments_essay_idx").on(t.essayId)]);

export const revisions = pgTable("revisions", {
  id: id(),
  essayId: text("essay_id").notNull().references(() => essays.id, { onDelete: "cascade" }),
  assessmentId: text("assessment_id"),
  depth: text("depth").notNull(), // corrections | targeted | exemplary
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  sentences: jsonb("sentences"), // Sentence[] snapshot of segmentation
  edits: jsonb("edits"), // validated RevisionEdit[]
  editStates: jsonb("edit_states").notNull().default({}), // { [editId]: "accepted" | "rejected" }
  overview: text("overview"),
  coaching: jsonb("coaching"), // { phrase_upgrades, ideas_for_15 }
  provider: text("provider"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
}, (t) => [index("revisions_essay_idx").on(t.essayId)]);

export const revisionExplanations = pgTable("revision_explanations", {
  id: id(),
  revisionId: text("revision_id").notNull().references(() => revisions.id, { onDelete: "cascade" }),
  editId: text("edit_id").notNull(),
  question: text("question").notNull().default(""),
  result: jsonb("result").notNull(),
  createdAt: createdAt(),
});

/** Computed state per skill. Recomputed deterministically from skill_evidence + error_patterns. */
export const skillStates = pgTable("skill_states", {
  skillKey: text("skill_key").primaryKey(),
  level: real("level"),
  confidence: real("confidence").notNull().default(0),
  trend: text("trend").notNull().default("insufficient_data"),
  masteryStatus: text("mastery_status").notNull().default("not_assessed"),
  evidenceCount: integer("evidence_count").notNull().default(0),
  sourceCount: integer("source_count").notNull().default(0),
  recommendedAction: text("recommended_action").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const skillEvidence = pgTable("skill_evidence", {
  id: id(),
  skillKey: text("skill_key").notNull(),
  sourceType: text("source_type").notNull(), // assessment | exercise | teacher | manual_note
  sourceId: text("source_id").notNull(), // assessment id / attempt id / teacher feedback id
  submissionKey: text("submission_key").notNull(), // groups evidence from the same piece of student work
  essayId: text("essay_id"),
  polarity: text("polarity").notNull(), // strength | weakness | neutral
  levelEstimate: real("level_estimate"),
  quote: text("quote").notNull().default(""),
  note: text("note").notNull(),
  isTransfer: boolean("is_transfer").notNull().default(false),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedReason: text("dismissed_reason"),
  createdAt: createdAt(),
}, (t) => [index("evidence_skill_idx").on(t.skillKey), index("evidence_source_idx").on(t.sourceId)]);

export const errorPatterns = pgTable("error_patterns", {
  id: id(),
  skillKey: text("skill_key").notNull(),
  label: text("label").notNull(),
  normalizedLabel: text("normalized_label").notNull(),
  category: text("category").notNull(), // grammar | collocation | vocabulary | register | structure | analysis | argument | evidence | other
  explanation: text("explanation").notNull().default(""),
  status: text("status").notNull().default("single"),
  occurrences: jsonb("occurrences").notNull().default([]), // PatternOccurrence[]
  cleanSubmissions: jsonb("clean_submissions").notNull().default([]), // submission keys where the pattern was checked and absent
  reviewIntervalDays: integer("review_interval_days").notNull().default(0),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  dismissedReason: text("dismissed_reason"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("error_patterns_label_idx").on(t.normalizedLabel)]);

export const exercises = pgTable("exercises", {
  id: id(),
  skillKey: text("skill_key").notNull(),
  errorPatternId: text("error_pattern_id"),
  sourceEssayId: text("source_essay_id"),
  type: text("type").notNull(),
  difficulty: text("difficulty").notNull(),
  isTransfer: boolean("is_transfer").notNull().default(false),
  timeLimitMinutes: integer("time_limit_minutes"),
  content: jsonb("content").notNull(), // validated ExerciseOutput (model answer included; hidden by API until attempted)
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("open"), // open | attempted | archived
  provider: text("provider"),
  createdAt: createdAt(),
}, (t) => [index("exercises_skill_idx").on(t.skillKey)]);

export const exerciseAttempts = pgTable("exercise_attempts", {
  id: id(),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  answer: text("answer").notNull(),
  timeUsedSeconds: integer("time_used_seconds"),
  status: text("status").notNull().default("submitted"), // submitted | evaluated | evaluation_failed
  outcome: text("outcome"), // correct | partial | incorrect
  score: real("score"),
  feedback: jsonb("feedback"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
});

export const vocabEntries = pgTable("vocab_entries", {
  id: id(),
  term: text("term").notNull(),
  meaning: text("meaning").notNull().default(""),
  collocations: jsonb("collocations").notNull().default([]),
  register: text("register").notNull().default("neutral"),
  example: text("example").notNull().default(""),
  pitfalls: text("pitfalls").notNull().default(""),
  topic: text("topic").notNull().default(""),
  sourceType: text("source_type").notNull().default("manual"), // manual | assessment | revision | exercise
  sourceId: text("source_id"),
  status: text("status").notNull().default("new"), // new | recognised | used_correctly | secure
  correctUses: integer("correct_uses").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  reviewIntervalDays: integer("review_interval_days").notNull().default(0),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("vocab_term_idx").on(t.term)]);

export const vocabReviews = pgTable("vocab_reviews", {
  id: id(),
  vocabId: text("vocab_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // recall | use_in_sentence
  response: text("response").notNull(),
  outcome: text("outcome").notNull(), // correct | partial | incorrect
  feedback: jsonb("feedback"),
  createdAt: createdAt(),
});

export const teacherFeedback = pgTable("teacher_feedback", {
  id: id(),
  essayId: text("essay_id").references(() => essays.id, { onDelete: "set null" }),
  teacherScore: real("teacher_score"),
  comments: text("comments").notNull().default(""),
  criteria: text("criteria").notNull().default(""),
  taskType: text("task_type"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  analysis: jsonb("analysis"), // TeacherAnalysisOutput, if analysed
  createdAt: createdAt(),
});

export const teacherObservations = pgTable("teacher_observations", {
  id: id(),
  statement: text("statement").notNull(),
  normalizedStatement: text("normalized_statement").notNull(),
  category: text("category").notNull(),
  feedbackIds: jsonb("feedback_ids").notNull().default([]),
  quotes: jsonb("quotes").notNull().default([]),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("teacher_obs_norm_idx").on(t.normalizedStatement)]);

/** Passages the student pasted from official documents after reading them (verified provenance). */
export const curriculumNotes = pgTable("curriculum_notes", {
  id: id(),
  sourceId: text("source_id"),
  title: text("title").notNull(),
  url: text("url").notNull().default(""),
  passage: text("passage").notNull(),
  appliesTo: text("applies_to").notNull().default("all"), // all | <task type key>
  createdAt: createdAt(),
});

export const progressReviews = pgTable("progress_reviews", {
  id: id(),
  stats: jsonb("stats").notNull(),
  result: jsonb("result").notNull(),
  provider: text("provider"),
  createdAt: createdAt(),
});

/** Operational log of AI calls. Stores outcomes and validation errors, never hidden reasoning. */
export const aiRuns = pgTable("ai_runs", {
  id: id(),
  operation: text("operation").notNull(),
  status: text("status").notNull(), // ok | error
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  validationErrors: jsonb("validation_errors"),
  provider: text("provider").notNull(),
  model: text("model"),
  durationMs: integer("duration_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  attempts: integer("attempts").notNull().default(1),
  relatedId: text("related_id"),
  createdAt: createdAt(),
}, (t) => [index("ai_runs_created_idx").on(t.createdAt)]);
