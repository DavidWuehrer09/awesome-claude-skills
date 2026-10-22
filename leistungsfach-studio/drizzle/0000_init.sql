CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"validation_errors" jsonb,
	"provider" text NOT NULL,
	"model" text,
	"duration_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"attempts" integer DEFAULT 1 NOT NULL,
	"related_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"essay_id" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"score_low" real,
	"score_high" real,
	"score_best" real,
	"content_score" real,
	"language_score" real,
	"confidence" text,
	"aggregation" jsonb,
	"result" jsonb,
	"calibration" jsonb,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"passage" text NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_key" text NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"category" text NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'single' NOT NULL,
	"occurrences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clean_submissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_interval_days" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"dismissed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essays" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"task_type" text NOT NULL,
	"operator" text DEFAULT '' NOT NULL,
	"task_prompt" text DEFAULT '' NOT NULL,
	"source_text" text DEFAULT '' NOT NULL,
	"essay_text" text NOT NULL,
	"word_count" integer NOT NULL,
	"rubric_text" text DEFAULT '' NOT NULL,
	"context" text DEFAULT 'practice' NOT NULL,
	"time_limit_minutes" integer,
	"time_used_minutes" integer,
	"parent_essay_id" text,
	"written_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"exercise_id" text NOT NULL,
	"answer" text NOT NULL,
	"time_used_seconds" integer,
	"status" text DEFAULT 'submitted' NOT NULL,
	"outcome" text,
	"score" real,
	"feedback" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evaluated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_key" text NOT NULL,
	"error_pattern_id" text,
	"source_essay_id" text,
	"type" text NOT NULL,
	"difficulty" text NOT NULL,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"time_limit_minutes" integer,
	"content" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_profile" (
	"id" text PRIMARY KEY DEFAULT 'me' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"year_level" integer DEFAULT 12 NOT NULL,
	"target_points" integer DEFAULT 15 NOT NULL,
	"default_mode" text DEFAULT 'teacher_standard' NOT NULL,
	"use_reported_weighting" boolean DEFAULT true NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"stats" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_explanations" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"edit_id" text NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"essay_id" text NOT NULL,
	"assessment_id" text,
	"depth" text NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"sentences" jsonb,
	"edits" jsonb,
	"edit_states" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overview" text,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"submission_key" text NOT NULL,
	"essay_id" text,
	"polarity" text NOT NULL,
	"level_estimate" real,
	"quote" text DEFAULT '' NOT NULL,
	"note" text NOT NULL,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_states" (
	"skill_key" text PRIMARY KEY NOT NULL,
	"level" real,
	"confidence" real DEFAULT 0 NOT NULL,
	"trend" text DEFAULT 'insufficient_data' NOT NULL,
	"mastery_status" text DEFAULT 'not_assessed' NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"recommended_action" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"essay_id" text,
	"teacher_score" real,
	"comments" text DEFAULT '' NOT NULL,
	"criteria" text DEFAULT '' NOT NULL,
	"task_type" text,
	"received_at" timestamp with time zone,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"statement" text NOT NULL,
	"normalized_statement" text NOT NULL,
	"category" text NOT NULL,
	"feedback_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"collocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"register" text DEFAULT 'neutral' NOT NULL,
	"example" text DEFAULT '' NOT NULL,
	"pitfalls" text DEFAULT '' NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"correct_uses" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"review_interval_days" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"vocab_id" text NOT NULL,
	"kind" text NOT NULL,
	"response" text NOT NULL,
	"outcome" text NOT NULL,
	"feedback" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_attempts" ADD CONSTRAINT "exercise_attempts_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_explanations" ADD CONSTRAINT "revision_explanations_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_feedback" ADD CONSTRAINT "teacher_feedback_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_reviews" ADD CONSTRAINT "vocab_reviews_vocab_id_vocab_entries_id_fk" FOREIGN KEY ("vocab_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_created_idx" ON "ai_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assessments_essay_idx" ON "assessments" USING btree ("essay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "error_patterns_label_idx" ON "error_patterns" USING btree ("normalized_label");--> statement-breakpoint
CREATE INDEX "essays_created_idx" ON "essays" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exercises_skill_idx" ON "exercises" USING btree ("skill_key");--> statement-breakpoint
CREATE INDEX "revisions_essay_idx" ON "revisions" USING btree ("essay_id");--> statement-breakpoint
CREATE INDEX "evidence_skill_idx" ON "skill_evidence" USING btree ("skill_key");--> statement-breakpoint
CREATE INDEX "evidence_source_idx" ON "skill_evidence" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_obs_norm_idx" ON "teacher_observations" USING btree ("normalized_statement");--> statement-breakpoint
CREATE INDEX "vocab_term_idx" ON "vocab_entries" USING btree ("term");