# Architecture

## Goals that shape the design

1. **Private, single learner.** One student's essays, scores and learner profile. Optional password protection; no third-party analytics.
2. **Nothing is lost.** Essays are saved *before* any AI call. AI results are new rows, so they never overwrite earlier ones. A failed call leaves the essay intact and records the failure.
3. **Evidence over impressions.** Skill levels change only through evidence from the student's own work (essays, exercise answers, teacher feedback). Reading an explanation or accepting an AI rewrite never counts as evidence.
4. **Honest about uncertainty.** Every score is a range with a confidence level. Curriculum statements carry provenance labels. Teacher-specific patterns stay separate from official requirements.
5. **Runs without Claude Code.** The runtime tutor instructions live in `src/lib/ai/prompts/` and `src/lib/curriculum/`. The `.claude/skills/` files are development-time guidance only.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Web framework | Next.js 16 (App Router) + React 19 + TypeScript | Server-side API routes keep the API key off the browser; one codebase for UI and API |
| Styling | Tailwind CSS v4 + CSS variables (light/dark) | Consistent design tokens, accessible colours |
| Database | PostgreSQL via Drizzle ORM | One schema and one migration set for both modes below |
| Local DB | **PGlite** (embedded Postgres, stored in `./data/pglite`) | No installation or account: `npm run dev` just works and data survives restarts |
| Hosted DB | Any Postgres (`DATABASE_URL`: Supabase, Neon, Railway…) | Same migrations; needed for serverless hosting |
| AI | `@anthropic-ai/sdk`, model `claude-opus-5-5` (configurable), structured outputs (`output_config.format` JSON schema) + Zod validation | Validated, typed responses; malformed output is rejected, never saved |
| Validation | Zod v4 | Shared between API input validation and AI output validation |
| Tests | Vitest (unit + integration with a temporary PGlite DB), Playwright (end-to-end with the mock AI provider) | Run without network access or an API key |

## Layering

```
src/app/(pages)          UI routes (server components read through services)
src/app/api/**/route.ts  HTTP API: input validation → service call → JSON
src/components/**        Client UI components (editor, diff viewer, charts)
src/server/services/**   Application logic (assessment, revision, learner model, training, vocab, calibration, progress)
src/server/db/**         Drizzle schema, client (PGlite or pg), migrations, repositories
src/lib/ai/**            Provider interface, Anthropic and mock providers, prompts, output schemas
src/lib/curriculum/**    Structured curriculum framework (task types, dimensions, operators, sources)
src/lib/learner/**       Pure functions: evidence aggregation, mastery rules, spaced repetition
src/lib/text/**          Sentence segmentation, word diff, word counts
```

UI code never imports from `src/server/db` directly. Pages call services, and client components call `/api/*`.

## AI operations (separate prompts and schemas)

| Operation | Prompt module (`src/lib/ai/prompts/`) | Output schema (`src/lib/ai/schemas.ts`) | Saved to |
| --- | --- | --- | --- |
| Essay assessment | `assessment.ts` | `AssessmentOutputSchema` | `assessments` |
| Essay revision | `revision.ts` (`REVISION_SYSTEM`) | `RevisionOutputSchema` (per-sentence edits) | `revisions` |
| Explanation of a change | `revision.ts` (`EXPLANATION_SYSTEM`) | `ExplanationOutputSchema` | `revision_explanations` |
| Learner-profile update | `learnerUpdate.ts` | `LearnerUpdateOutputSchema` (observations + error patterns) | `skill_evidence`, `error_patterns` → deterministic `skill_states` recompute |
| Exercise generation | `exercises.ts` (`EXERCISE_GENERATION_SYSTEM`) | `ExerciseOutputSchema` | `exercises` |
| Exercise evaluation | `exercises.ts` (`EXERCISE_EVALUATION_SYSTEM`) | `ExerciseEvaluationOutputSchema` | `exercise_attempts` (+ evidence) |
| Progress evaluation | `misc.ts` (`PROGRESS_SYSTEM`) | `ProgressReviewOutputSchema` | `progress_reviews` |
| Vocabulary use check | `misc.ts` (`VOCAB_SYSTEM`) | `VocabUseOutputSchema` | `vocab_reviews` |
| Teacher-feedback analysis | `misc.ts` (`TEACHER_SYSTEM`) | `TeacherAnalysisOutputSchema` | `teacher_observations` |

Shared blocks (rules, teaching principles, effect chain, curriculum rendering) live in `shared.ts`, so no instruction is duplicated across operations.

Every prompt is assembled from clearly separated blocks:
`<shared_rules>` (honesty and pedagogy) · `<curriculum_reference>` (only the relevant task type) · `<assessment_rules>` (mode-specific) · `<teacher_calibration>` (teacher-specific evidence, labelled) · `<learner_context>` · `<current_task>`.
The stable blocks come first, so prompt caching applies.

Pipeline for every call: build prompt → provider call (with timeout and limited retries) → `JSON.parse` → Zod validation → semantic validation (quotes really occur in the essay, sentence IDs exist, score ranges are coherent) → save. On failure: one repair retry that includes the validation errors; then the run is recorded as failed in `ai_runs`, and the user sees an error and a retry button.

## Scoring

The model rates each task-specific dimension as a 0–15 range with evidence. Code combines them deterministically:
- Each dimension belongs to the **Content & structure** group or the **Language** group (the official rubric columns).
- Within a group: weighted mean using the task type's dimension weights (labelled *interpretation*).
- Overall: **40 % content / 60 % language**, plus the "content below 3 caps the task at 3" rule, as reported for the KMS (S9). Shown as *reported, unverified*; can be switched off in Settings (then a plain mean of the two groups is used, also labelled).
- Mode adjusts how the model treats borderline evidence (supportive / teacher standard / strict). It never changes the arithmetic.
- Teacher calibration: with ≥ 3 teacher-scored essays, the mean offset between teacher scores and teacher-standard estimates is shown and applied as a *calibrated estimate* beside the raw one, with its spread.

## Learner model rules (in `src/lib/learner/`, unit-tested)

- Evidence sources: `assessment`, `exercise`, `teacher`. Never `revision_viewed` or `explanation_read`.
- Level = recency-weighted mean of the evidence level estimates (last 6).
- Confidence = f(number of independent sources, consistency, recency).
- Error patterns: `single` (seen in 1 submission) → `recurring` (≥ 2 different submissions) → `improving` (a recurring pattern absent from the last 2 relevant submissions) → `resolved_provisional` (absent from 3 or more, including at least one transfer exercise).
- Skill mastery status: `not_assessed` · `emerging` · `developing` · `recurring_weakness` · `improving` · `appears_secure_untested` (strong but fewer than 3 independent sources, or no transfer evidence) · `secure`.
- The student can dismiss any evidence item or error pattern (soft delete with a reason). The state is then recomputed.

## Spaced review

SM-2-style intervals (1, 3, 7, 16, 35 days…) for vocabulary entries and recurring error patterns. A failed review resets the interval. Items due today appear on the Dashboard and in Training.

## Data model (summary; see `src/server/db/schema.ts`)

`learner_profile`, `essays` (immutable submission; `parent_essay_id` for resubmissions), `assessments`, `revisions`, `revision_explanations`, `skill_states`, `skill_evidence`, `error_patterns`, `exercises`, `exercise_attempts`, `vocab_entries`, `vocab_reviews`, `teacher_feedback`, `teacher_observations`, `curriculum_notes` (verified pastes from official documents), `progress_reviews`, `ai_runs` (operation log: status, duration, tokens, error; no hidden reasoning).

## Security and privacy

- `ANTHROPIC_API_KEY` is read only on the server (`src/lib/ai/anthropic.ts`). `.env*` is git-ignored.
- Optional `APP_PASSWORD`: `src/proxy.ts` requires an HMAC-signed, httpOnly session cookie on all pages and APIs. Production mode refuses to start without it unless `ALLOW_NO_PASSWORD=true` (local-only use).
- Export everything as JSON (`/api/export`); delete individual essays and evidence; full reset with typed confirmation.
- Essay text is sent only to the Anthropic API.

## Files created

```
leistungsfach-studio/
  CLAUDE.md, AGENTS.md                       development rules (AGENTS.md is maintained by Next.js)
  .claude/skills/                            6 development-time Skills (validated by npm run skills:check)
  docs/                                      ARCHITECTURE, CURRICULUM_RESEARCH, DATABASE, DEPLOYMENT
  drizzle/                                   SQL migrations
  scripts/                                   migrate.ts, validate-skills.mjs
  src/proxy.ts                               optional password protection
  src/app/                                   pages: / (dashboard), /examiner, /revision(/[id]), /training(/[id]),
                                             /vocabulary, /essays(/[id]), /profile, /login; api/** route handlers
  src/components/                            ui.tsx, Nav, examiner/, assessment/, revision/, training/, vocab/, profile/, charts/
  src/lib/ai/                                client.ts (validation pipeline), anthropic.ts, mock.ts, schemas.ts, constants.ts, depths.ts, types.ts, prompts/
  src/lib/curriculum/                        sources, dimensions, taskTypes, framework (requirements, bands, modes)
  src/lib/learner/                           skills, model (mastery rules), spaced, priorities
  src/lib/scoring/aggregate.ts               deterministic score combination
  src/lib/text/                              normalize, segment, diff, revisionDoc
  src/lib/progress/caveats.ts                comparison caveats
  src/server/                                db/ (schema, client), services/ (assessment, revision, learner, training, vocab, calibration, progress, curriculum, essays, profile, data), http.ts, log.ts
  tests/unit, tests/integration, tests/e2e   Vitest and Playwright suites
```
