---
name: essay-assessment
description: Build, change, debug or evaluate the Training Studio's essay examiner — the assessment prompt, AssessmentOutput schema, semantic validators, deterministic score aggregation (dimension ranges → content/language groups → 0–15 range), the three grading modes and teacher calibration. Use when touching src/lib/ai/prompts/assessment.ts, src/lib/ai/schemas.ts, src/lib/scoring/*, src/server/services/assessment.ts, the Essay Examiner UI, or when judging whether an assessment the app produced is fair and evidence-based.
---

# Essay assessment engine

Curriculum content (task types, dimensions, bands, modes, the 40/60 rule) is defined in the **bavarian-english-leistungsfach** Skill — do not restate or alter it here. This Skill covers *how the engine works* and how to keep it trustworthy.

## Pipeline

```
POST /api/essays            → essays row saved first (never lost)
POST /api/essays/:id/assess → services/assessment.ts
   1. load essay, task type config, learner context, teacher calibration, verified curriculum notes
   2. buildAssessmentPrompt(mode)              src/lib/ai/prompts/assessment.ts
   3. runAI(AssessmentOutputSchema)            src/lib/ai/client.ts (timeout, 1 repair retry)
   4. validateAssessmentSemantics(output, essay)  quotes must occur in essay/source; only the task's dimensions; low ≤ best ≤ high
   5. aggregateScore(dimensions, taskType, settings)  src/lib/scoring/aggregate.ts (pure, tested)
   6. insert assessments row (status completed) — or status failed + error, essay untouched
   7. learner update (learner-modelling Skill) — failure here never deletes the assessment
```

## The model's job vs. the code's job

| The model decides | The code decides |
| --- | --- |
| Range per dimension (0–15 low/high/best) with evidence quotes | Which dimensions apply and their weights |
| Strengths, weaknesses (major vs minor), action plan | Group means, 40/60 combination, content cap |
| Confidence and what would change it | Final range, calibration offset, labels |

Never let the model output a final overall score that bypasses aggregation; its `holistic_check` field is only compared against the computed score and a large disagreement (> 3 points) is surfaced as a warning, not silently resolved.

## Constraints

- Every weakness and strength needs a verbatim `quote` from the essay (validator rejects otherwise; allow whitespace/quote-mark normalisation only).
- `severity`: `major` = conceptual/task-level (missed operator, no analysis, no counter-argument, misreading); `minor` = local language. Language errors are never `major` unless they impede meaning systematically.
- Group repeated errors into one weakness with several examples.
- Missing task prompt or source text → confidence must be `low` and `uncertainty_notes` must say why (enforced in validator).
- Mode changes framing and borderline resolution only (see foundation §7). `aggregateScore` deliberately takes no mode parameter, so the arithmetic is identical across modes.
- Teacher calibration (≥ 3 teacher-scored essays with a teacher-standard assessment) produces `calibrated_range` alongside raw; always labelled `teacher_specific`.
- Bump `ASSESSMENT_PROMPT_VERSION` on any prompt change.

## Workflow: changing the rubric or prompt

1. Change curriculum data first (foundation Skill workflow).
2. Edit the prompt; keep blocks ordered stable → volatile for caching.
3. Update `tests/unit/scoring-and-validation.test.ts` (fixtures in `tests/fixtures/essays.ts`) if the schema changed.
4. Run `npm test` and the mock-provider e2e (`npm run test:e2e`).
5. With an API key, spot-check manually: run `npm run dev`, submit the fixture essay from `tests/fixtures/essays.ts` in each mode and compare the outputs (costs a few cents per assessment; ask before running). There is no automated live-API eval yet.

## Example: reviewing an assessment for fairness

Given a comment essay with a clear position but a straw-man counter-argument:
- Expect `argumentation` ≈ 7–10 with a `major` weakness quoting the counter-argument sentence and explaining *why* it is a straw man.
- Expect no penalty under `analytical_depth` (not a dimension for `comment`).
- If the output criticises correct, natural English as "unnatural", that is a defect: fix the prompt rule ("never mark correct English as wrong because you would phrase it differently") rather than the fixture.

## Example: debugging "assessment failed"

1. `ai_runs` row for the essay → `error_code` (`timeout`, `schema_invalid`, `semantic_invalid`, `refusal`, `api_error`, `not_configured`).
2. `schema_invalid`/`semantic_invalid`: the stored `validation_errors` list names the field; reproduce by pasting the offending output into a case in `tests/unit/scoring-and-validation.test.ts`.
3. Never "fix" by loosening a validator that protects against invented quotes.
