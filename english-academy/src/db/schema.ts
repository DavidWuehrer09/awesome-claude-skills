/**
 * Database schema (PostgreSQL via Drizzle).
 *
 * Conventions:
 * - Every user-owned row carries `user_id`; repositories always filter on it.
 * - Vocabulary content (vocab_entries, examples, links) is separate from the
 *   learner's per-word state (learning_states, review_events).
 * - Timestamps are `timestamptz` (stored in UTC); "today" is computed in the
 *   user's configured IANA timezone.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

// ---------------------------------------------------------------- users

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  /** Usage plan for AI allowances (see src/server/ai/usage.ts); configurable per deployment. */
  plan: text("plan").notNull().default("free"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token); the raw token only lives in the cookie
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type MasteryDimension =
  | "recognition"
  | "meaning"
  | "spelling"
  | "collocation"
  | "grammar"
  | "context"
  | "production"
  | "writing";

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  locale: text("locale").notNull().default("de-DE"),
  targetLevel: text("target_level").notNull().default("C1"),
  mainGoal: text("main_goal"),
  examDate: text("exam_date"), // YYYY-MM-DD in the user's timezone
  sessionMinutes: integer("session_minutes").notNull().default(15),
  dailyNewLimit: integer("daily_new_limit").notNull().default(12),
  dailyReviewLimit: integer("daily_review_limit").notNull().default(150),
  requestRetention: real("request_retention").notNull().default(0.9),
  typoTolerance: text("typo_tolerance").notNull().default("normal"), // strict | normal | lenient
  reminderTime: text("reminder_time").notNull().default("17:30"), // HH:MM local
  reminderDays: jsonb("reminder_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6, 0]),
  quietStart: text("quiet_start").notNull().default("21:30"),
  quietEnd: text("quiet_end").notNull().default("07:30"),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  pushPromptDeclined: boolean("push_prompt_declined").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  aiProfileConsent: boolean("ai_profile_consent").notNull().default(true),
  theme: text("theme").notNull().default("system"),
  reducedMotion: boolean("reduced_motion").notNull().default(false),
  showStreak: boolean("show_streak").notNull().default(true),
  onboarded: boolean("onboarded").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------- vocabulary

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("topic"), // topic | collection
    description: text("description"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("topics_user_idx").on(t.userId), index("topics_parent_idx").on(t.parentId)],
);

export type WordFamilyMember = { form: string; pos?: string };
export type Confusable = { word: string; distinction: string };
export type EnrichmentMeta = {
  provider: string;
  model: string;
  promptVersion: string;
  at: string;
  demo: boolean;
  fields: string[];
};

export const vocabEntries = pgTable(
  "vocab_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    headword: text("headword").notNull(),
    normalized: text("normalized").notNull(),
    partOfSpeech: text("part_of_speech"),
    translationDe: text("translation_de"),
    definitionEn: text("definition_en"),
    cefr: text("cefr"),
    register: text("register"),
    connotation: text("connotation"),
    collocations: jsonb("collocations").$type<string[]>().notNull().default([]),
    synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
    antonyms: jsonb("antonyms").$type<string[]>().notNull().default([]),
    wordFamily: jsonb("word_family").$type<WordFamilyMember[]>().notNull().default([]),
    patterns: jsonb("patterns").$type<string[]>().notNull().default([]),
    grammarNotes: text("grammar_notes"),
    pronunciation: text("pronunciation"),
    ipa: text("ipa"),
    commonMistakes: jsonb("common_mistakes").$type<string[]>().notNull().default([]),
    confusables: jsonb("confusables").$type<Confusable[]>().notNull().default([]),
    idioms: jsonb("idioms").$type<string[]>().notNull().default([]),
    acceptedAnswers: jsonb("accepted_answers").$type<string[]>().notNull().default([]),
    source: text("source"),
    mnemonic: text("mnemonic"),
    notes: text("notes"),
    favorite: boolean("favorite").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    enrichment: jsonb("enrichment").$type<EnrichmentMeta | null>(),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vocab_user_norm_pos_uq").on(t.userId, t.normalized, sql`coalesce(${t.partOfSpeech}, '')`),
    index("vocab_user_idx").on(t.userId),
  ],
);

export const vocabExamples = pgTable(
  "vocab_examples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    kind: text("kind").notNull().default("natural"), // natural | academic | context | user | source
    topicId: uuid("topic_id"),
    origin: text("origin").notNull().default("user"), // user | import | ai | sample
    createdAt: createdAt(),
  },
  (t) => [index("examples_entry_idx").on(t.entryId)],
);

export const topicMemberships = pgTable(
  "topic_memberships",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.topicId] }), index("memberships_topic_idx").on(t.topicId)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tags_user_name_uq").on(t.userId, t.name)],
);

export const entryTags = pgTable(
  "entry_tags",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] })],
);

/** Labelled relationships for mind maps. `origin=user` links survive AI regeneration. */
export const vocabLinks = pgTable(
  "vocab_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    fromEntryId: uuid("from_entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    toEntryId: uuid("to_entry_id").references(() => vocabEntries.id, { onDelete: "cascade" }),
    toLabel: text("to_label"),
    relation: text("relation").notNull(),
    note: text("note"),
    origin: text("origin").notNull().default("user"), // user | ai | derived
    createdAt: createdAt(),
  },
  (t) => [index("links_user_idx").on(t.userId), index("links_from_idx").on(t.fromEntryId)],
);

export type ImportCandidate = {
  key: string;
  headword: string;
  translationDe?: string;
  definitionEn?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
  partOfSpeech?: string;
  heading?: string;
  suggestedTopic?: string;
  uncertain: string[]; // reasons, never silently dropped
  duplicateOf?: { entryId: string; headword: string; kind: "exact" | "near" };
  include: boolean;
  raw: string;
};

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(), // paste | file | image
    filename: text("filename"),
    status: text("status").notNull().default("review"), // review | imported | cancelled
    detectedFormat: text("detected_format"),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    candidates: jsonb("candidates").$type<ImportCandidate[]>().notNull().default([]),
    result: jsonb("result").$type<{ created: number; merged: number; skipped: number; topicIds: string[] } | null>(),
    createdAt: createdAt(),
  },
  (t) => [index("imports_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- learning

export type DimensionScore = { score: number; n: number; last?: string };
export type MasteryMap = Partial<Record<MasteryDimension, DimensionScore>>;

export const learningStates = pgTable(
  "learning_states",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    due: ts("due").notNull(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: smallint("state").notNull().default(0), // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
    lastReview: ts("last_review"),
    introducedAt: ts("introduced_at"),
    mastery: jsonb("mastery").$type<MasteryMap>().notNull().default({}),
    overconfidence: integer("overconfidence").notNull().default(0),
    markedDifficult: boolean("marked_difficult").notNull().default(false),
    version: integer("version").notNull().default(1),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entryId] }), index("states_due_idx").on(t.userId, t.due)],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    topicId: uuid("topic_id"),
    plannedMinutes: integer("planned_minutes"),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [index("sessions_study_user_idx").on(t.userId, t.startedAt)],
);

export const reviewEvents = pgTable(
  "review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id").notNull().references(() => vocabEntries.id, { onDelete: "cascade" }),
    clientEventId: text("client_event_id").notNull(),
    sessionId: uuid("session_id"),
    exerciseKind: text("exercise_kind").notNull(),
    dimension: text("dimension").notNull(),
    outcome: text("outcome").notNull(), // correct | alternative | typo | partial | wrong | revealed
    rating: smallint("rating").notNull(),
    selfRating: smallint("self_rating"),
    hintsUsed: integer("hints_used").notNull().default(0),
    independent: boolean("independent").notNull(),
    latencyMs: integer("latency_ms"),
    answer: text("answer"),
    countedForSchedule: boolean("counted_for_schedule").notNull(),
    late: boolean("late").notNull().default(false),
    prevState: jsonb("prev_state").$type<Record<string, unknown> | null>(),
    nextDue: ts("next_due"),
    reviewedAt: ts("reviewed_at").notNull(),
    undoneAt: ts("undone_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("review_client_event_uq").on(t.userId, t.clientEventId),
    index("review_user_time_idx").on(t.userId, t.reviewedAt),
    index("review_entry_idx").on(t.entryId),
  ],
);

/** Learner-profile skill estimates, updated only from completed work. */
export const learnerSkills = pgTable(
  "learner_skills",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    score: real("score").notNull(),
    evidence: integer("evidence").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skill] })],
);

export const recommendationStates = pgTable(
  "recommendation_states",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    status: text("status").notNull(), // dismissed | postponed | done
    until: ts("until"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// ---------------------------------------------------------------- writing

export const writingPrompts = pgTable(
  "writing_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    section: text("section").notNull(), // sentence | paragraph | vocab_context | argument | refinement | editing | timed | essay | abitur
    taskType: text("task_type").notNull(), // comment | analysis | literary | characterisation | mediation | comparison | creative | paragraph | sentence | ...
    title: text("title").notNull(),
    instructions: text("instructions").notNull(),
    sourceText: text("source_text"),
    sourceLabel: text("source_label"),
    answerKey: text("answer_key"), // model / key, revealed only after submission
    targetEntryIds: jsonb("target_entry_ids").$type<string[]>().notNull().default([]),
    targetWords: jsonb("target_words").$type<string[]>().notNull().default([]),
    timeLimitMinutes: integer("time_limit_minutes"),
    minWords: integer("min_words"),
    maxWords: integer("max_words"),
    difficulty: text("difficulty").notNull().default("C1"),
    origin: text("origin").notNull().default("library"), // library | ai | user | sample
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("prompts_user_idx").on(t.userId)],
);

export const writingDrafts = pgTable(
  "writing_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id").references(() => writingPrompts.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Untitled draft"),
    body: text("body").notNull().default(""),
    timerStartedAt: ts("timer_started_at"),
    elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("drafts_user_idx").on(t.userId, t.updatedAt)],
);

export const writingSubmissions = pgTable(
  "writing_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").notNull().references(() => writingDrafts.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id"),
    body: text("body").notNull(),
    wordCount: integer("word_count").notNull(),
    versionNo: integer("version_no").notNull(),
    elapsedSeconds: integer("elapsed_seconds"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("submissions_draft_version_uq").on(t.draftId, t.versionNo),
    index("submissions_user_idx").on(t.userId, t.createdAt),
  ],
);

export const writingAssessments = pgTable(
  "writing_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => writingSubmissions.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // pending | complete | failed
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    isDemo: boolean("is_demo").notNull().default(false),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("assessments_user_idx").on(t.userId)],
);

export const feedbackResponses = pgTable(
  "feedback_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id").notNull().references(() => writingAssessments.id, { onDelete: "cascade" }),
    annotationId: text("annotation_id").notNull(),
    action: text("action").notNull(), // understood | challenge | clarify | accepted | rejected
    message: text("message"),
    reply: jsonb("reply").$type<Record<string, unknown> | null>(),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_assessment_idx").on(t.assessmentId)],
);

/** Recurring writing weaknesses, revisited on an expanding schedule. */
export const writingErrorPatterns = pgTable(
  "writing_error_patterns",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    occurrences: integer("occurrences").notNull().default(0),
    submissionsAffected: integer("submissions_affected").notNull().default(0),
    cleanSubmissions: integer("clean_submissions").notNull().default(0),
    lastSeen: ts("last_seen"),
    nextRevisit: ts("next_revisit"),
    intervalDays: integer("interval_days").notNull().default(1),
    examples: jsonb("examples").$type<string[]>().notNull().default([]),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

// ---------------------------------------------------------------- tutor

export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    topicId: uuid("topic_id"),
    attachedEntryIds: jsonb("attached_entry_ids").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tutor_conv_user_idx").on(t.userId, t.updatedAt)],
);

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("tutor_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

// ---------------------------------------------------------------- notifications

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

export const reminderDeliveries = pgTable(
  "reminder_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // push | email
    localDate: text("local_date").notNull(), // YYYY-MM-DD in the user's timezone
    status: text("status").notNull(), // claimed | sent | failed | skipped
    attempts: integer("attempts").notNull().default(0),
    detail: text("detail"), // short machine reason, never message content
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminder_once_per_day_uq").on(t.userId, t.channel, t.localDate)],
);

// ---------------------------------------------------------------- AI metadata

export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    category: text("category").notNull().default("other"), // allowance category, see src/server/ai/usage.ts
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull(), // ok | invalid_output | error | refused | rate_limited
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estCostUsd: real("est_cost_usd"),
    errorCode: text("error_code"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_requests_user_idx").on(t.userId, t.createdAt), index("ai_requests_created_idx").on(t.createdAt)],
);

/** Fixed-window counters shared by every app instance (rate limiting without Redis). */
export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------------------------------------------------------------- My English Examiner (exam simulator)

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export type MaterialLabels = { topic: string[]; date?: string; examType?: string; yearLevel?: string; importance?: "low" | "normal" | "high" | "essential"; tags: string[]; title?: string };

/** Uploaded course materials: previous exams, source texts, rubrics, corrections... */
export const examMaterials = pgTable(
  "exam_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    uploadSession: text("upload_session").notNull(),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    original: bytea("original"),
    text: text("text").notNull().default(""),
    originalText: text("original_text").notNull().default(""),
    textHistory: jsonb("text_history").$type<{ version: number; at: string; note: string; text: string }[]>().notNull().default([]),
    extractionMethod: text("extraction_method").notNull(),
    extractionStatus: text("extraction_status").notNull(), // needs_transcription | needs_review | reviewed
    extractionNotes: jsonb("extraction_notes").$type<string[]>().notNull().default([]),
    docType: text("doc_type"), // confirmed type, null until the user confirms
    guess: text("guess").notNull(),
    guessConfidence: text("guess_confidence").notNull(),
    labels: jsonb("labels").$type<MaterialLabels>().notNull().default({ topic: [], tags: [] }),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("exam_materials_user_idx").on(t.userId)],
);

export type ProfileEvidence = { materialId?: string; quote?: string; location?: string; url?: string };

export const examProfileEntries = pgTable(
  "exam_profile_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    statement: text("statement").notNull(),
    provenance: text("provenance").notNull(), // teacher_explicit | observed_pattern | official_guidance | general_principle | ai_suggestion
    confidence: text("confidence").notNull(), // confirmed | high | medium | low | provisional
    evidence: jsonb("evidence").$type<ProfileEvidence[]>().notNull().default([]),
    userEdited: boolean("user_edited").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("exam_profile_user_idx").on(t.userId)],
);

export const examCourse = pgTable("exam_course", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  yearLevel: text("year_level"),
  courseLevel: text("course_level"),
  preferredFormat: text("preferred_format"),
  officialGuidance: jsonb("official_guidance").$type<{ title: string; url: string; summary: string; verified: boolean; checked: string }[]>().notNull().default([]),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    difficulty: text("difficulty").notNull(),
    blueprint: jsonb("blueprint").$type<Record<string, unknown>>().notNull(),
    exam: jsonb("exam").$type<Record<string, unknown>>().notNull(), // includes the hidden section; never sent to the exam room
    validation: jsonb("validation").$type<{ warnings: string[]; originality: unknown[] }>().notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("exams_user_idx").on(t.userId)],
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"), // in_progress | submitted
    timed: boolean("timed").notNull().default(true),
    draft: jsonb("draft").$type<Record<string, string>>().notNull().default({}),
    draftVersion: integer("draft_version").notNull().default(1),
    timing: jsonb("timing").$type<{ startedAt?: string; elapsedSeconds?: number; pausedSeconds?: number; pauses?: number; overtimeSeconds?: number }>().notNull().default({}),
    createdAt: createdAt(),
    submittedAt: ts("submitted_at"),
  },
  (t) => [index("exam_attempts_user_idx").on(t.userId)],
);

export const examAttemptVersions = pgTable(
  "exam_attempt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    kind: text("kind").notNull(), // submission | revision
    note: text("note"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull(),
    wordCounts: jsonb("word_counts").$type<Record<string, number>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exam_attempt_version_uq").on(t.attemptId, t.n)],
);

export const examAssessments = pgTable(
  "exam_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    attemptId: uuid("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull(), // pending | complete | failed
    data: jsonb("data").$type<Record<string, unknown> | null>(),
    error: text("error"),
    disputes: jsonb("disputes").$type<{ id: string; commentId: string; argument: string; status: string; response?: string; at: string }[]>().notNull().default([]),
    unhelpful: jsonb("unhelpful").$type<{ commentId: string; reason: string; at: string }[]>().notNull().default([]),
    provider: text("provider"),
    promptVersion: text("prompt_version"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exam_assessment_version_uq").on(t.attemptId, t.version)],
);
