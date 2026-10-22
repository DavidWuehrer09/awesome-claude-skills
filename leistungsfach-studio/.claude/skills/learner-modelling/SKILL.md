---
name: learner-modelling
description: Build or change the persistent learner model — the skill catalogue, skill_evidence and error_patterns tables, the learner-update prompt, deterministic recomputation of level/confidence/trend/mastery status, spaced-review scheduling, and the student's ability to correct or remove profile information. Use when touching src/lib/learner/*, src/server/services/learner.ts, src/lib/ai/prompts/learnerUpdate.ts, the Learner Profile page, or when deciding whether some interaction should count as evidence of learning.
---

# Learner modelling

The learner model is the system's memory. Its credibility depends on one rule: **only the student's own, unaided production counts as evidence.** Skill-to-dimension mappings and the "transfer is the test" principle come from the **bavarian-english-leistungsfach** Skill (§4, §8); this Skill defines how evidence is stored and aggregated.

## What counts as evidence

| Source | Counts? | Notes |
| --- | --- | --- |
| Assessed essay (student's text) | Yes — `assessment` | Observations extracted by the learner-update call |
| Exercise attempt, evaluated | Yes — `exercise` | Transfer exercises (new text/topic) flagged `is_transfer` |
| Teacher feedback entered by student | Yes — `teacher` | Labelled teacher_specific; weighted like assessment evidence |
| Reading an explanation, viewing a model answer | **No** | |
| Accepting an AI revision | **No** | |
| A resubmitted essay that copies accepted AI edits | Reduced | `parent_essay_id` set → the learner service skips observations and error examples whose quote occurs only in accepted AI revision text of the parent essay (not in the student's original) |

## Skill catalogue (`src/lib/learner/skills.ts`)

`analytical_depth`, `purpose_effect`, `evidence_integration`, `argument_development`, `paragraph_structure`, `intro_conclusion`, `cohesion_transitions`, `vocabulary_precision`, `idiomatic_collocations`, `grammar_variety`, `register_conventions`, `time_management`, `operator_fulfilment`, `comprehension_accuracy`.
Each maps to one or more assessment dimensions (foundation Skill §4) so assessment evidence lands in the right place.

## Deterministic rules (`src/lib/learner/model.ts`, unit-tested — change tests first)

- **Level** (0–15): recency-weighted mean of the last 6 evidence `level_estimate`s (weights 1.0, 0.85, 0.7, …). `null` when no evidence.
- **Confidence** (0–1): grows with the number of *independent submissions* (not observations), penalised by spread (std-dev) and age; capped at 0.4 with one submission.
- **Trend**: mean of the last 3 vs previous 3 estimates; `improving` if Δ ≥ 1.0, `declining` if Δ ≤ −1.0, else `stable`; `insufficient_data` with < 4 estimates.
- **Error pattern status**: `single` (1 submission) → `recurring` (≥ 2 distinct submissions) → `improving` (recurring, absent in last 2 relevant submissions) → `resolved_provisional` (absent in ≥ 3 including ≥ 1 transfer exercise). Recurrence again → back to `recurring`.
- **Mastery status**: `not_assessed` · `emerging` (level < 7) · `developing` (7–10) · `recurring_weakness` (any active recurring pattern for the skill) · `improving` (trend up) · `appears_secure_untested` (level ≥ 12 but < 3 independent sources or no transfer evidence) · `secure` (level ≥ 12, ≥ 3 sources incl. transfer, no recurring pattern, no weakness in last 3).
- **Recommended next action**: derived from status (e.g. recurring_weakness → targeted exercise on that pattern; appears_secure_untested → transfer task).

## Learner-update call

Input: the saved assessment (not the raw model reasoning), the essay, the list of *existing* active error patterns with ids. Output: `observations[]` (skill_key, polarity, quote, note, level_estimate) and `error_patterns[]` (existing_pattern_id or new label, category, example quote, correction). The validator requires quotes to occur in the essay and pattern ids to exist. Matching to existing patterns is the model's suggestion; labels are normalised (lower-case, trimmed) and exact-label matches are merged in code.

## Student control

- Dismiss evidence or a pattern with a reason → soft-delete (`dismissed_at`, `dismissed_reason`) → `recomputeSkill()`.
- Add a manual note ("my teacher says my intros are strong") → stored as `manual_note` evidence with `level_estimate: null`; it is shown to the tutor in prompts but excluded from level computation.
- Reset a skill → dismisses all its evidence (confirmation required).

## Spaced review (`src/lib/learner/spaced.ts`)

Intervals 1 → 3 → 7 → 16 → 35 → 75 days; success advances, partial repeats, failure resets to 1. Used for vocabulary entries and recurring error patterns.

## Example

Essay 1: "make a decision" ✓, "discuss about" ✗ → pattern *"discuss + about"* `single`.
Essay 2: "discuss about the issue" again → `recurring`, skill `idiomatic_collocations` status `recurring_weakness`, next action "collocation exercise: discuss/debate/argue".
Exercise (transfer, new topic) correct + Essays 3–4 clean → `improving` then `resolved_provisional`. Never `secure` from one good essay.
