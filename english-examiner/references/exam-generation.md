# Generating an exam

Goal: reproduce the **format** of the student's real exams (task types, wording style, sequence, balance, length, demand) with **new content**.

## 1. Collect inputs

1. `materials search --type exam_paper` and `profile show`. Read the reference exam(s) the blueprint names with `materials show <id> --full`.
2. Note the format features as a checklist:
   - number and order of tasks
   - operator verbs and their exact phrasing style ("Summarise … as presented in the text")
   - word limits, points (BE) per task, time
   - the choice structure (for example "3a or 3b")
   - source genre and length (count the words)
   - permitted aids, and anything else on the cover sheet
3. If `focus_weaknesses` is set, run `weakness recommend`. If `include_vocabulary` is set, run `vocab suggest --n 8 --topic <topic>`.
4. If anything essential is missing (topic, duration), ask one concise question, or use the blueprint default and name it in `provenance.assumptions`.

## 2. Write the source text(s)

- Prefer a newly written text. Set `kind: fictional_practice` and a label such as "Fictional practice text written for this exam. It is not a real publication and has no real author." No author name, outlet or date.
- Match the reference genre (opinion piece, speech, short-story extract …) and length (±15 %). Line-break it like a printed exam (about 10–14 words per line) and set `line_numbered: true`; the Exam Room numbers non-blank lines. Line references in tasks must use those numbers, so count them.
- Difficulty comes from argument density, implicit stance, irony, structural moves and register, not obscure words. Stretch and Abitur texts can be longer and more implicit.
- Build in analysable features deliberately (concession, an anecdote, a metaphor, a rhetorical question, a frame), but vary which ones from the reference text.
- Weave vocabulary targets into tasks where they arise naturally (for example the comment topic invites them). Never list them for the student; they go in `hidden.vocabulary_targets`.
- `kind: uploaded_material` reuses a course text the student uploaded (`material_id`). That's allowed, but the tasks must be new.
- `kind: authentic` only with a citation you have verified exists. Never invent publication details.

## 3. Write the tasks

- Keep the reference's operator and the shape of the instruction; change the content. "Examine the means the author uses to convey their attitude towards young voters" becomes "Analyse how the author makes their warning persuasive", not the same sentence with one word swapped. `exam save` rejects instructions ≥ 90 % similar to a reference sentence and source texts that share ≥ 15 % of their 8-word sequences with it.
- Fill `expected_length`, `suggested_minutes` (summing to no more than `duration_minutes`) and, if the reference uses points, `points`.
- Points: `marking.origin` is `teacher_provided` only if you copy an uploaded scheme (give `source_material_ids`). Otherwise use `ai_practice` with a label containing "practice". If no defensible scheme exists, omit points and set `origin: none`.

## 4. Hidden section (never shown during the exam)

For every task, `hidden.task_expectations` holds `expected_content` (what a complete answer covers), `acceptable_alternatives` (other defensible readings), `common_pitfalls` and optional `marking_notes`. Grading uses these later; they are what stops the grader from improvising.

## 5. Save and check

```bash
python3 scripts/examiner.py exam check --json exam.json   # dry run
python3 scripts/examiner.py exam save --json exam.json
```

Fix every error and read every warning. `examples/exam.json` shows a complete, valid exam.

## Difficulty levels

| Level | Source text | Tasks |
| --- | --- | --- |
| consolidation | Clear structure, explicit stance | Familiar operators, scaffolding hints allowed in `general_instructions` |
| realistic | Matches the reference exams | Same operators and lengths as the reference |
| stretch | Implicit stance, irony or two perspectives; up to 20 % longer | Combined operators ("analyse … and assess"), comparison, less guidance |
| abitur | Per verified official guidance (see bavarian-context.md) | Abitur-style choice tasks; state assumptions |

Mode `mock` adds a cover-sheet-style `general_instructions`, full duration, no hints. `challenging` sits between realistic and stretch.
