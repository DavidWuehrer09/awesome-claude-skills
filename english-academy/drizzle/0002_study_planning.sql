ALTER TABLE "user_settings" ADD COLUMN "target_topic_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "study_intensity" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "preferred_study_time" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "weekly_summary_email" boolean DEFAULT false NOT NULL;