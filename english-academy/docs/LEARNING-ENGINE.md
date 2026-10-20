# Learning engine

How the app decides what to show, how answers are graded, and when a word counts as known.
Everything here is deterministic and runs without AI. The AI only enriches entries and
evaluates free-text answers.

Code: `src/domain/learning/` (pure functions, unit-tested) and `src/server/repos/learning.ts`
(persistence).

## 1. Scheduling (FSRS)

The app uses FSRS through [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)
(`scheduler.ts`).

| Setting | Value | Why |
|---|---|---|
| Target retention | 90 % by default; Settings offers 80–95 % (the engine clamps to 0.75–0.97) | 90 % is the usual trade-off between workload and forgetting |
| Fuzz | off | The same history always gives the same due date, so tests and the undo function are reproducible |
| Maximum interval | 365 days, strictly clamped | Mastered words are still tested at least once a year; nothing is removed from revision |
| Short-term steps | on | New and forgotten words come back within the same session |

Each word has one FSRS state (`learning_states`): stability, difficulty, due, reps, lapses and
state (New, Learning, Review, Relearning).

### From an answer to a rating

`deriveRating()` combines the objective result with the learner's own Again/Hard/Good/Easy:

- A wrong or revealed answer is always **Again**. If the learner had rated it Good or Easy, the
  overconfidence counter goes up.
- Recognition exercises (multiple choice, matching) are capped at **Hard**. Picking from options
  is not recall.
- A hint, a typo, a partly correct answer, or a valid alternative instead of the target word are
  also capped at **Hard**.
- Self-graded flip cards trust the learner. After two overconfident ratings they are capped at
  Hard.
- An "Easy" that took longer than 15 seconds is reduced to Good.
- The learner can always lower a rating, but can raise it only as far as the evidence allows.

The reason is stored with each review and shown in the word's history.

### Review events

Every answer is a `review_events` row:

- **Idempotent.** The client creates a `clientEventId` (a UUID). Re-sending the same event, for
  example after an offline retry, does nothing.
- **Undoable.** The row keeps `prevState`. Undo restores it and marks the event `undoneAt`. Only
  the learner's most recent event can be undone.
- **Late events never rewind.** An offline event that arrives after a newer review has already
  been applied is still stored, but with `late=true, countedForSchedule=false`. The current
  schedule is not overwritten with an older one.

## 2. Mastery dimensions

FSRS answers "when should this be tested again?". It does not say what the learner can do with
the word. `mastery.ts` therefore tracks eight separate dimensions. Each is a score from 0 to 1,
updated with a weighted moving average where early evidence counts more (α = max(0.25, 1/n)).

| Dimension | Fed by |
|---|---|
| Recognition | multiple choice, matching, English→German flip |
| Meaning recall | German→English typed, definition→word |
| Spelling and form | typed answers (typos score 0.6) |
| Collocations | collocation completion, collocation choice |
| Grammatical use | word-form exercises, the AI's grammar verdict |
| Context | cloze and context choice |
| Active production | own sentences, translation, transformation |
| Use in writing | the word used correctly in a submitted Writing Lab text |

Levels (`masteryLevel`):

- **New:** no evidence yet.
- **Learning:** some evidence.
- **Recognised:** recognition ≥ 0.6.
- **Recalled:** meaning ≥ 0.6.
- **Used actively:** production ≥ 0.6 and meaning ≥ 0.6.
- **Mastered:** production ≥ 0.7, writing ≥ 0.6, meaning ≥ 0.7 *and* FSRS stability of at least
  21 days. Recognition alone can never make a word "mastered".

## 3. Choosing what to study (`selection.ts`)

`buildQueue()` is a pure function. Its inputs are the learner's states, the session length and
the daily limits. It returns the cards for the session, each with a reason:

1. **Due and overdue words first.** Relearning and learning cards come first of all, then by
   lateness relative to stability (a word 3 days late with a 2-day interval is more urgent than
   one 3 days late with a 60-day interval). When the daily review limit is reached, the remaining
   due words stay due and are reported as *deferred*. They are never dropped.
2. **Targeted extra practice (up to 25 % of the session).** These are words that are not due but
   are weak:
   - marked difficult, or forgotten at least 3 times
   - stable, but weak in production or collocations
   - never used in writing

   These cards do **not** change the schedule (`schedule: false`).
3. **New words,** up to the daily new-word limit.
4. **Interleaving.** Cards from different topics alternate, except in focused-topic mode.

Session modes:

- `review`: due words only.
- `mixed`: the default.
- `focused`: one topic, not interleaved.
- `practice`: free practice on any word, never scheduled.

## 4. Exercise choice (`exercises.ts`)

There are 12 deterministic exercise kinds, generated from the entry's own data. Examples are
flip cards, typed recall, cloze from the learner's example sentences, collocation choice,
confusable choice and word forms.

`chooseKind()` picks the hardest kind the word is ready for. New words start with recognition and
meaning. Production and collocation follow once meaning is stable. A kind is only offered if the
entry has the data for it (no cloze without an example sentence).

The AI generates a further set (translation, error correction, transformation, context choice,
Sentence Lab). These exercises are optional and validated against a schema.

## 5. Typed-answer checking (`answers.ts`)

`checkAnswer()` normalises case, typography (curly quotes, dashes) and a leading "to", then
returns one of these verdicts:

| Verdict | Example (target *to mitigate*) | Effect |
|---|---|---|
| exact | "mitigate", "to mitigate" | correct |
| alternative | a listed accepted answer or synonym | counts, rating capped at Hard, the target is shown |
| typo | "mitgate" (edit distance: 0 for words ≤ 4 letters, 1 up to 8, 2 above) | counts as a slip, capped at Hard |
| wrong_form | "mitigated" when the base form was asked | shown as a form error, not a typo |
| confused | a listed confusable (e.g. *alleviate* vs *mitigate*) | wrong, and the distinction is explained |
| wrong / empty | anything else | Again |

If the learner thinks an answer was graded unfairly, they can press "Accept my answer". The
answer is added to that entry's `acceptedAnswers`, is visible and editable in the word editor, and
from then on counts as an *alternative*. The current card is treated the same way, so it is
capped at Hard.

## 6. Writing → vocabulary

When a Writing Lab submission is assessed, each target word of the task gets `writing` and
`production` evidence. The score depends on the assessment's verdict for that word: correct and
natural, correct but unnatural, or wrong. This is the only way to reach the "Mastered" level. Error
patterns from assessments (e.g. *register*, *article use*) are counted in
`writing_error_patterns` and feed the recommendations.
