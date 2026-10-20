CREATE TABLE "rate_limit_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_counters_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "ai_requests" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_requests_created_idx" ON "ai_requests" USING btree ("created_at");