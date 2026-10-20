# Teacher-style grading

Grade only a **submitted, locked version** (`attempt show <id> --version N`). Before writing anything, load:
- the exam with its hidden expectations (`exam show <exam_id>`)
- the teacher materials: `materials search --type rubric`, plus teacher corrections and model answers
- the course profile (`profile show`) and the student's earlier feedback flags (`assess preferences`)

## Procedure

1. **Read the whole answer first.** Decide the two or three things that matter most for the mark before collecting small errors.
2. **Judge each task by its own type.** Check `expected_content` and `acceptable_alternatives`: credit a defensible point that isn't on the list, and say so. Adapt the dimensions:
   - Summary: completeness, condensing, own words, neutrality, simple present. Not argumentation, and not device spotting.
   - Analysis: technique → example (with line) → effect → link to intention. Penalise lists without effects. Don't reward device names that add nothing.
   - Comment / discussion: position, development, examples, counterargument plus rebuttal, conclusion, length.
   - Mediation: addressee, purpose, selection, adaptation (not literal translation), text type.
   - Literary analysis / characterisation: evidence-based interpretation; several readings may be valid.
3. **Two perspectives, kept separate.**
   - `course_specific`: apply only what the teacher documented (`teacher_explicit`, quoted) and clearly labelled patterns. List what you cannot judge for lack of evidence in `insufficient_evidence_notes`.
   - `independent`: general upper-secondary standards. Say which standard you mean.
4. **Comments.** One per important issue, most important first. Each has:
   - `original` (an exact excerpt from the answer; the CLI checks this)
   - `problem`, `why_weakens`, `alternative`, `why_better`
   - `category`: content / task_fulfilment / structure / language_error / style / optional_refinement
   - `english_status` (below), `severity`, `provenance`

   | english_status | Use when | Severity |
   | --- | --- | --- |
   | `incorrect` | Grammatically or lexically wrong | any |
   | `unnatural` | Understandable, but a native writer would not say it | minor or moderate |
   | `imprecise` | Correct but vague or generic | any |
   | `valid_less_effective` | A legitimate choice that is weaker here | minor or none; never `language_error` |
   | `excellent` | Already very good: no alternative, severity `none` | none |
   | `not_language` | Content, reasoning, structure, task fulfilment | any |

   Never mark correct English as wrong because you would phrase it differently. Group repeated small errors into one comment ("three missing genitive apostrophes, for example …") instead of ten.
5. **Strengths.** At least one, quoted exactly, with the reason it works.
6. **Estimate.** See honesty-rules.md §3. Work out a range per task, then combine using the exam's weights. Name the evidence, the limiting factors and the most valuable changes.
7. **Improvement plan.** Three to five prioritised actions, each tied to a weakness skill.
8. **Lab** (improvement-lab.md) for the three to six passages with the highest learning value.
9. **Model answer** for each task, matching the word limits and register, quoting only real text. Add `alternative_interpretations` and at least one side-by-side `comparison` that names what is already strong in the student's version.
10. **Weakness observations.** For every taxonomy skill relevant to this exam, record `present: true/false`. A `false` for an applicable skill is important evidence of improvement. Link each to the comment IDs.
11. **Vocabulary.** For each `hidden.vocabulary_targets` term: was it used, and was it used naturally?

Then run `assess check --json a.json`, fix any errors, and `assess save --json a.json`. Open the report path it prints.

## "Why did you mark this?"

When the student asks about comment `cN`:
1. Re-read the original sentence in context and explain the reasoning, citing the provenance (teacher rule, general principle, or your own suggestion).
2. If they push back, weigh the argument honestly: dictionary evidence, the teacher's own conventions, and context all count.
3. Record it: `assess dispute <asm> cN --argument "…"`, then `assess resolve <asm> d1 --outcome upheld|revised|withdrawn --response "…" [--revision rev.json]`. Revising or withdrawing updates the report and weakness tracking.
4. If they only find a comment unhelpful (rather than wrong), use `assess unhelpful`, and check `assess preferences` before future grading.
