# Database

PostgreSQL schema managed with Drizzle ORM. Source of truth: `src/server/db/schema.ts`. Migrations: `drizzle/` (generated with `npm run db:generate`, applied automatically when the app starts, or with `npm run db:migrate`).

- **Local**: embedded PGlite (real Postgres compiled to WebAssembly) in `./data/pglite` (`PGLITE_DIR`).
- **Hosted**: any PostgreSQL via `DATABASE_URL`. The same migrations apply.

All ids are UUID strings. Timestamps are `timestamptz`. Rows are only soft-deleted (`dismissed_at`) where the student "removes" learner evidence, so a correction never destroys the history.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `learner_profile` | Single row (`id = 'me'`): name, year, default mode, `use_reported_weighting` (40/60 rule on/off), goals | |
| `essays` | Submitted work. **Immutable**: a revised essay is a new row with `parent_essay_id` | `task_type`, `operator`, `task_prompt`, `source_text`, `essay_text`, `rubric_text`, `context` (practice, homework, classwork, exam_simulation), `time_limit_minutes`, `time_used_minutes` |
| `assessments` | One row per assessment run, including **failed** runs (`status`, `error_code`, `error_message`) | `mode`, `score_low/best/high`, `content_score`, `language_score`, `confidence`, `aggregation` (method, notes, cap), `result` (validated AI output), `calibration`, `provider`, `model`, `prompt_version` |
| `revisions` | Revision runs | `depth`, `sentences` (segmentation snapshot), `edits` (validated), `edit_states` (accepted/rejected per edit), `overview` |
| `revision_explanations` | "Explain this change" results | `revision_id`, `edit_id`, `question`, `result` |
| `skill_states` | Computed per skill (recomputed deterministically, never edited by hand) | `level`, `confidence`, `trend`, `mastery_status`, `evidence_count`, `source_count`, `recommended_action` |
| `skill_evidence` | Observations from the student's own work | `skill_key`, `source_type` (assessment, exercise, teacher, manual_note), `submission_key` (groups one piece of work), `polarity`, `level_estimate`, `quote`, `note`, `is_transfer`, `dismissed_at/_reason` |
| `error_patterns` | Recurring-error tracking | `label`, `normalized_label` (unique), `category`, `status` (single, recurring, improving, resolved_provisional), `occurrences[]`, `clean_submissions[]`, `review_interval_days`, `next_review_at` |
| `exercises` | Generated exercises (the model answer is stored but hidden by the API until an attempt exists) | `skill_key`, `type`, `difficulty`, `is_transfer`, `error_pattern_id`, `content`, `reason` |
| `exercise_attempts` | Answers, saved **before** evaluation | `answer`, `status` (submitted, evaluated, evaluation_failed), `outcome`, `score`, `feedback` |
| `vocab_entries` / `vocab_reviews` | Vocabulary bank and practice history | `term`, `meaning`, `collocations[]`, `register`, `example`, `pitfalls`, `status` (new, recognised, used_correctly, secure), `correct_uses`, spaced-review fields |
| `teacher_feedback` | Teacher marks, comments and criteria (optionally linked to an essay) | `teacher_score`, `comments`, `criteria`, `analysis` |
| `teacher_observations` | Teacher-specific expectations extracted from feedback, with supporting feedback ids and quotes | `statement`, `feedback_ids[]`, `quotes[]` |
| `curriculum_notes` | Official passages the student read and pasted (provenance "official verified") | `source_id`, `title`, `url`, `passage`, `applies_to` |
| `progress_reviews` | AI progress reviews and the statistics they were based on | `stats`, `result` |
| `ai_runs` | Operational log of every AI call: status, error code, validation errors, duration, tokens, attempts. **No prompts and no hidden reasoning are stored.** | |

Deleting an essay cascades to its assessments, revisions and explanations. Learner evidence from it is soft-dismissed ("Essay deleted"), its error-pattern occurrences are removed, and the skills are recomputed. A full reset (*Profile → Data & privacy*) deletes every row.
