CREATE TABLE "ai_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"est_cost_usd" real,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_tags" (
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "entry_tags_entry_id_tag_id_pk" PRIMARY KEY("entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "exam_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"data" jsonb,
	"error" text,
	"disputes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unhelpful" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text,
	"prompt_version" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_attempt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"n" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"answers" jsonb NOT NULL,
	"word_counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"timed" boolean DEFAULT true NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_version" integer DEFAULT 1 NOT NULL,
	"timing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exam_course" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"year_level" text,
	"course_level" text,
	"preferred_format" text,
	"official_guidance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"upload_session" text NOT NULL,
	"filename" text NOT NULL,
	"media_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"original" "bytea",
	"text" text DEFAULT '' NOT NULL,
	"original_text" text DEFAULT '' NOT NULL,
	"text_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extraction_method" text NOT NULL,
	"extraction_status" text NOT NULL,
	"extraction_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"doc_type" text,
	"guess" text NOT NULL,
	"guess_confidence" text NOT NULL,
	"labels" jsonb DEFAULT '{"topic":[],"tags":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_profile_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section" text NOT NULL,
	"statement" text NOT NULL,
	"provenance" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"difficulty" text NOT NULL,
	"blueprint" jsonb NOT NULL,
	"exam" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"annotation_id" text NOT NULL,
	"action" text NOT NULL,
	"message" text,
	"reply" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"filename" text,
	"status" text DEFAULT 'review' NOT NULL,
	"detected_format" text,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_skills" (
	"user_id" uuid NOT NULL,
	"skill" text NOT NULL,
	"score" real NOT NULL,
	"evidence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_skills_user_id_skill_pk" PRIMARY KEY("user_id","skill")
);
--> statement-breakpoint
CREATE TABLE "learning_states" (
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"introduced_at" timestamp with time zone,
	"mastery" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overconfidence" integer DEFAULT 0 NOT NULL,
	"marked_difficult" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_states_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "recommendation_states" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_states_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"local_date" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"client_event_id" text NOT NULL,
	"session_id" uuid,
	"exercise_kind" text NOT NULL,
	"dimension" text NOT NULL,
	"outcome" text NOT NULL,
	"rating" smallint NOT NULL,
	"self_rating" smallint,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"independent" boolean NOT NULL,
	"latency_ms" integer,
	"answer" text,
	"counted_for_schedule" boolean NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"prev_state" jsonb,
	"next_due" timestamp with time zone,
	"reviewed_at" timestamp with time zone NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"topic_id" uuid,
	"planned_minutes" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_memberships" (
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_memberships_entry_id_topic_id_pk" PRIMARY KEY("entry_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'topic' NOT NULL,
	"description" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"topic_id" uuid,
	"attached_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"locale" text DEFAULT 'de-DE' NOT NULL,
	"target_level" text DEFAULT 'C1' NOT NULL,
	"main_goal" text,
	"exam_date" text,
	"session_minutes" integer DEFAULT 15 NOT NULL,
	"daily_new_limit" integer DEFAULT 12 NOT NULL,
	"daily_review_limit" integer DEFAULT 150 NOT NULL,
	"request_retention" real DEFAULT 0.9 NOT NULL,
	"typo_tolerance" text DEFAULT 'normal' NOT NULL,
	"reminder_time" text DEFAULT '17:30' NOT NULL,
	"reminder_days" jsonb DEFAULT '[1,2,3,4,5,6,0]'::jsonb NOT NULL,
	"quiet_start" text DEFAULT '21:30' NOT NULL,
	"quiet_end" text DEFAULT '07:30' NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"push_prompt_declined" boolean DEFAULT false NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_profile_consent" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"reduced_motion" boolean DEFAULT false NOT NULL,
	"show_streak" boolean DEFAULT true NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vocab_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headword" text NOT NULL,
	"normalized" text NOT NULL,
	"part_of_speech" text,
	"translation_de" text,
	"definition_en" text,
	"cefr" text,
	"register" text,
	"connotation" text,
	"collocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"antonyms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_family" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grammar_notes" text,
	"pronunciation" text,
	"ipa" text,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confusables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idioms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text,
	"mnemonic" text,
	"notes" text,
	"favorite" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"enrichment" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"text" text NOT NULL,
	"kind" text DEFAULT 'natural' NOT NULL,
	"topic_id" uuid,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_entry_id" uuid NOT NULL,
	"to_entry_id" uuid,
	"to_label" text,
	"relation" text NOT NULL,
	"note" text,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "writing_assessments_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "writing_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt_id" uuid,
	"title" text DEFAULT 'Untitled draft' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"timer_started_at" timestamp with time zone,
	"elapsed_seconds" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_error_patterns" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"submissions_affected" integer DEFAULT 0 NOT NULL,
	"clean_submissions" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone,
	"next_revisit" timestamp with time zone,
	"interval_days" integer DEFAULT 1 NOT NULL,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_error_patterns_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "writing_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section" text NOT NULL,
	"task_type" text NOT NULL,
	"title" text NOT NULL,
	"instructions" text NOT NULL,
	"source_text" text,
	"source_label" text,
	"answer_key" text,
	"target_entry_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_words" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_limit_minutes" integer,
	"min_words" integer,
	"max_words" integer,
	"difficulty" text DEFAULT 'C1' NOT NULL,
	"origin" text DEFAULT 'library' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "writing_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"prompt_id" uuid,
	"body" text NOT NULL,
	"word_count" integer NOT NULL,
	"version_no" integer NOT NULL,
	"elapsed_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_entry_id_vocab_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_tags" ADD CONSTRAINT "entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_assessments" ADD CONSTRAINT "exam_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_assessments" ADD CONSTRAINT "exam_assessments_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempt_versions" ADD CONSTRAINT "exam_attempt_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempt_versions" ADD CONSTRAINT "exam_attempt_versions_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_course" ADD CONSTRAINT "exam_course_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_materials" ADD CONSTRAINT "exam_materials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_profile_entries" ADD CONSTRAINT "exam_profile_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_responses" ADD CONSTRAINT "feedback_responses_assessment_id_writing_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."writing_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_skills" ADD CONSTRAINT "learner_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_states" ADD CONSTRAINT "learning_states_entry_id_vocab_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_states" ADD CONSTRAINT "recommendation_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_entry_id_vocab_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memberships" ADD CONSTRAINT "topic_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memberships" ADD CONSTRAINT "topic_memberships_entry_id_vocab_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_memberships" ADD CONSTRAINT "topic_memberships_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_conversations" ADD CONSTRAINT "tutor_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_messages" ADD CONSTRAINT "tutor_messages_conversation_id_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_entries" ADD CONSTRAINT "vocab_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_examples" ADD CONSTRAINT "vocab_examples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_examples" ADD CONSTRAINT "vocab_examples_entry_id_vocab_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_links" ADD CONSTRAINT "vocab_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_links" ADD CONSTRAINT "vocab_links_from_entry_id_vocab_entries_id_fk" FOREIGN KEY ("from_entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_links" ADD CONSTRAINT "vocab_links_to_entry_id_vocab_entries_id_fk" FOREIGN KEY ("to_entry_id") REFERENCES "public"."vocab_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_assessments" ADD CONSTRAINT "writing_assessments_submission_id_writing_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."writing_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_drafts" ADD CONSTRAINT "writing_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_drafts" ADD CONSTRAINT "writing_drafts_prompt_id_writing_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."writing_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_error_patterns" ADD CONSTRAINT "writing_error_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_prompts" ADD CONSTRAINT "writing_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_submissions" ADD CONSTRAINT "writing_submissions_draft_id_writing_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."writing_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_user_idx" ON "ai_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_assessment_version_uq" ON "exam_assessments" USING btree ("attempt_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_attempt_version_uq" ON "exam_attempt_versions" USING btree ("attempt_id","n");--> statement-breakpoint
CREATE INDEX "exam_attempts_user_idx" ON "exam_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exam_materials_user_idx" ON "exam_materials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exam_profile_user_idx" ON "exam_profile_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exams_user_idx" ON "exams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_assessment_idx" ON "feedback_responses" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "imports_user_idx" ON "import_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "states_due_idx" ON "learning_states" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_once_per_day_uq" ON "reminder_deliveries" USING btree ("user_id","channel","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "review_client_event_uq" ON "review_events" USING btree ("user_id","client_event_id");--> statement-breakpoint
CREATE INDEX "review_user_time_idx" ON "review_events" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_entry_idx" ON "review_events" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_study_user_idx" ON "study_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_uq" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "memberships_topic_idx" ON "topic_memberships" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topics_user_idx" ON "topics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topics_parent_idx" ON "topics" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tutor_conv_user_idx" ON "tutor_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "tutor_msg_conv_idx" ON "tutor_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vocab_user_norm_pos_uq" ON "vocab_entries" USING btree ("user_id","normalized",coalesce("part_of_speech", ''));--> statement-breakpoint
CREATE INDEX "vocab_user_idx" ON "vocab_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "examples_entry_idx" ON "vocab_examples" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "links_user_idx" ON "vocab_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "links_from_idx" ON "vocab_links" USING btree ("from_entry_id");--> statement-breakpoint
CREATE INDEX "assessments_user_idx" ON "writing_assessments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drafts_user_idx" ON "writing_drafts" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "prompts_user_idx" ON "writing_prompts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_draft_version_uq" ON "writing_submissions" USING btree ("draft_id","version_no");--> statement-breakpoint
CREATE INDEX "submissions_user_idx" ON "writing_submissions" USING btree ("user_id","created_at");