---
name: adaptive-tutoring
description: Build or change Personal Training — choosing the top three learning priorities after an essay, generating targeted exercises (diagnostics, sentence improvement, device analysis, evidence-and-interpretation, paragraph reconstruction, collocations, grammar from real errors, timed tasks, transfer tasks), evaluating answers, recording results and follow-ups, and vocabulary retrieval practice. Use when touching src/lib/ai/prompts/exercises.ts, src/lib/ai/prompts/misc.ts (vocabulary check), src/server/services/training.ts or vocab.ts, or the Training and Vocabulary pages.
---

# Adaptive tutoring

Teaching principles (diagnose first, active practice, transfer, precision over ornament) are defined in the **bavarian-english-leistungsfach** Skill §8. Evidence rules are in **learner-modelling**. This Skill covers exercise design and the training loop.

## The loop

```
assessment ─► priorities = selectPriorities(skillStates, assessment)   (src/lib/learner/priorities.ts, pure)
            ─► generate exercise for a priority (AI)  → exercises row (model answer stored, hidden until attempt)
            ─► student answers                       → exercise_attempts row saved BEFORE evaluation
            ─► evaluate (AI)                          → feedback, outcome, score 0–1, follow-up
            ─► evidence(skill, is_transfer) → recompute skill; spaced review updated
```

## Priority selection (deterministic)

Score each skill: impact (dimension weight for the essay's task type × gap to 13) + recurrence bonus (recurring pattern) + low-confidence bonus (needs diagnosis), minus recency penalty (trained in the last 2 days). Pick the top 3 distinct skills; each priority stores *why* it was chosen (shown to the student).

## Exercise types (`ExerciseType`)

| Key | Purpose | Evaluation focus |
| --- | --- | --- |
| `diagnostic` | 3–5 short questions to estimate a low-confidence skill | Correctness per item |
| `sentence_improvement` | Improve 3–5 of the student's *own* weak sentences (or close variants) | Did the fix address the principle without new errors? |
| `device_analysis` | Quote from a short new passage → write the effect chain | Function, effect, purpose present and specific |
| `evidence_interpretation` | Claim → choose and integrate evidence → explain | Relevance, integration, explanation |
| `paragraph_reconstruction` | Reorder/repair a scrambled or weak paragraph | Logic, topic sentence, cohesion |
| `collocation` | Gap-fill / choose / produce collocations from real errors | Natural usage; produce in own sentence |
| `grammar` | Targeted items built from the student's actual error pattern | Accuracy; explain the rule in one line |
| `timed_task` | Short timed writing (e.g. 15-minute comment paragraph) | Full mini-assessment on the targeted skill + time used |
| `transfer` | Same skill on a new text or topic | Counts as transfer evidence |

## Constraints

- Every exercise has: objective (one skill, one sentence), instructions, difficulty (`foundation` / `core` / `stretch` / `exam`), the content, success criteria, a model answer **hidden until the student submits**.
- Exercise texts are **original practice material**, labelled "practice text written for this exercise"; never attributed to real authors or publications.
- Difficulty adapts: two `correct` outcomes on a skill at a level → next exercise one level up; two `incorrect` → one level down.
- Feedback is specific to the answer (quote it), says what is right, what is missing, and the next step. Never only "Good job".
- Vocabulary: prefer precise, natural C1–C2 items relevant to the essay topic and task type; reject showy, unnatural or archaic suggestions. Recognition is not mastery — an entry is `used_correctly` only after the student writes a correct original sentence with it (vocabulary practice); `secure` needs three correct uses spaced over at least a week. (Detecting use inside essays is not implemented yet.)

## Example: generating from a real error

Error pattern: *"despite of"* (recurring, 3 examples). Generated exercise (`grammar`, core):
- Objective: "Use *despite* / *in spite of* / *although* correctly."
- Items: 4 gap-fills using new contexts from the student's topic area + 1 "write your own sentence about the text you analysed using *despite*".
- Success criteria: all forms correct; own sentence natural and grammatical.
- Follow-up after 3/5: "Review again in 3 days; next essay: check every *despite* before submitting."
