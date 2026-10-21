# Learning engine

How the app decides what to show, how answers are graded, and when a word counts as known.
Everything here is deterministic and runs without AI. The AI only enriches entries,
evaluates free-text answers and gives a labelled second opinion on typed answers that the
deterministic check marked wrong (section 5).

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

   **Exam close.** When the exam date in Settings is at most 8 weeks away (`examPrepActive`,
   until the exam day), the extra-practice share grows to 40 % and about two thirds of it goes
   to exam-relevant words first. Every not-due word of those topics is a candidate, not only the
   weak ones, ranked by the weaker of production and collocation mastery (then lapses); the
   reason is shown as *Exam preparation* unless a weakness reason applies. Exam-relevant topics
   are the learner's topics (and their subtopics) whose names match the topic labels of uploaded
   exam materials; when nothing matches, every word counts. Review-only sessions are unchanged.
3. **New words,** up to the daily new-word limit.
4. **Interleaving.** Cards from different topics alternate, except in focused-topic mode.

Session modes:

- `review`: due words only.
- `mixed`: the default.
- `focused`: one topic, not interleaved.
- `practice`: free practice on any word, never scheduled.

The Practice page has one topic picker for all non-AI modes; the chosen topic is passed to the
session as `topic` and narrows `buildQueue()` (and the Mastery Check) to that topic.

## 4. Exercise choice (`exercises.ts`)

There are 13 deterministic exercise kinds, generated from the entry's own data. Examples are
flip cards, typed recall, cloze from the learner's example sentences, collocation choice,
confusable choice, word forms and the EN→DE meaning check (an English example sentence with the
word; the learner types its German meaning, checked against every listed translation with the
rules of section 5).

`chooseKind()` picks the hardest kind the word is ready for. New words start with recognition and
meaning. Production and collocation follow once meaning is stable. A kind is only offered if the
entry has the data for it (no cloze without an example sentence).

**Missed words in a session.** A wrong or revealed answer brings the word back a few cards
later (at most twice, as unscheduled practice). Each retry uses a different kind
(`retryKinds()`): recall in context first (cloze, collocation, definition → word, typed recall,
EN→DE, own sentence), recognition last. A session limited to several kinds (the sprint) keeps
that limit; a single-kind mode may retry with any other kind. Only a word that supports no other
kind repeats the same card. The server attaches the retry exercises to each card, so this also
works offline.

**Adaptive Mixed Challenge.** The Mixed Challenge (`adaptive=1`) attaches one exercise per
difficulty tier to each card (`KIND_TIER`: 1 recognition, 2 guided recall, 3 typed recall and
cloze, 4 collocation and own sentences). `adaptiveTier()` starts at tier 2; two successes in a row
move one tier up, an error one tier down, a partly correct answer resets the streak. The next
card's exercise is the variant closest to the current tier (the easier one on a tie), so the
sequence is deterministic for the same answers.

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

**AI second opinion.** When the verdict is a plain *wrong* (not empty, typo, wrong form or
confused) for a recall, cloze, collocation or EN→DE card, and a real AI provider is available and
enabled, the app automatically asks the small `answerCheck` feature (fast model, low effort)
whether the answer is a valid synonym or translation in this context. If it is, the card counts
as an *alternative* (capped at Hard, target word shown) and the AI's explanation is shown with an
"AI check" label; if not, the AI's short explanation of the difference is shown. Nothing is added
to `acceptedAnswers` automatically. In demo mode, or when AI is off or over its allowance, the
deterministic verdict stays unchanged (no imitation judgement). The "My answer is also correct"
button remains available.

## 5a. During a session

- **Mark as difficult.** The flag button in the session header marks the current word as
  difficult (`/api/vocab/[id]/difficult`), which feeds the *difficult* extra-practice reason.
- **Mastery Check report.** Besides the per-dimension summary, the report lists every word as
  *secure* or *weak* with the dimensions that failed. Retries after a miss are not counted.

## 6. Writing → vocabulary

When a Writing Lab submission is assessed, each target word of the task gets `writing` and
`production` evidence. The score depends on the assessment's verdict for that word: correct and
natural, correct but unnatural, or wrong. This is the only way to reach the "Mastered" level. Error
patterns from assessments (e.g. *register*, *article use*) are counted in
`writing_error_patterns` and feed the recommendations.
