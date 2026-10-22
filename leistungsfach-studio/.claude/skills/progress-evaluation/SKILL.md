---
name: progress-evaluation
description: Build or change the progress dashboard, essay history comparisons, teacher-calibration statistics and the AI progress review — score timelines, per-dimension trends, recurring errors, fastest-improving and attention-needing skills, exercise and vocabulary statistics, exam-simulation results, and the caveats that make comparisons meaningful. Use when touching src/server/services/progress.ts or calibration.ts, src/lib/ai/prompts/misc.ts (progress review), src/components/charts/*, the Dashboard or Essay History pages.
---

# Progress evaluation

Numbers on the dashboard are only as honest as the comparisons behind them. Score semantics come from the **bavarian-english-leistungsfach** Skill; evidence semantics from **learner-modelling**.

## What the dashboard shows (all computed from stored rows — never synthesised)

| Panel | Source | Comparability rule |
| --- | --- | --- |
| Score timeline | `assessments` (completed) — range bar + most-likely dot, single series | Task type and mode in each tooltip and in the table view; caveats for the latest pair; no fitted trend line (too few, too heterogeneous points) |
| Dimension performance | assessment dimension ranges | Only dimensions shared by the compared tasks |
| Skills improving / needing attention | `skill_states` trend + status | Requires `trend != insufficient_data` |
| Recurring errors | `error_patterns` status recurring/improving | Count of distinct submissions |
| Exercises | `exercise_attempts` | Outcome mix by skill and difficulty |
| Vocabulary | `vocab_entries` | Learned = used correctly ≥ 1; secure = ≥ 3 spaced successes |
| Exam simulations | essays with `context = exam_simulation` | Time used vs allowed |
| Next steps | priorities + due reviews | |

Empty states explain what produces data ("Assess your first essay to see your score timeline") — never placeholder numbers.

## Comparison caveats (`src/lib/progress/caveats.ts`, pure)

Generate a caveat when comparing two assessments if: task types differ; modes differ; one lacks a source text or task prompt; confidence is low on either; prompt versions differ in major version; word counts differ by > 50 %; one was timed and the other not. Score change smaller than the overlap of the two ranges → "within the margin of uncertainty".

## Teacher calibration (`src/server/services/calibration.ts`)

- Pairs: essays with a teacher score and a completed `teacher_standard` assessment.
- n < 3 → "not enough data"; show pairs only.
- n ≥ 3 → mean offset (teacher − most-likely estimate), spread (SD), and per-task-type means (always reported with their n). Consistent tendency = |mean| ≥ 1 and SD ≤ 1.5; otherwise "inconsistent / uncertain".
- Teacher observations (from teacher-feedback analysis) list how many feedback items support each; one item = "single observation", never a rule.

## AI progress review

Input: computed statistics and caveats only (no raw essays). Output: summary, genuine improvements (each citing a stat), concerns, cautions about comparability, 3 next steps. Validator rejects any number in the text that does not appear in the input statistics.

## Example caveat

Essay A: comment, teacher_standard, 9–11. Essay B: literary analysis, strict, 8–10.
→ "Different task types and modes: the drop may reflect the harder task and stricter mode rather than a change in ability. Compare B with your next literary analysis instead."
