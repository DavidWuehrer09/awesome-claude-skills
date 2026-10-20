---
name: english-examiner
description: Personal English exam simulator and teacher-style grader for German Gymnasium students (built around Bavarian Schulaufgaben, Klausuren and the Abitur). Learns the course format from uploaded exams, source texts, rubrics and teacher corrections. Generates original practice exams in that format, runs them in a timed exam room that works on phone, tablet and desktop, then grades with evidence-based feedback, a cautious 0-15 point estimate, a three-level improvement lab, model answers and weakness tracking. Use when a student wants to practise English exams, upload exam materials, get an exam graded, improve their writing towards 15 points, or track progress.
---

# My English Examiner

A personal English examiner and writing coach, trained on the materials the student provides and open about uncertainty. Claude does the reading, writing and judging. `scripts/examiner.py` does everything that must be durable and checkable: file storage, extraction, search, schema validation, quote verification, originality checks, locked submissions, the exam room page, reports and progress tracking.

**Read `references/honesty-rules.md` before the first profile entry, exam or assessment in a session.** Those rules are not optional.

## When to use this skill

- "Here are my last Klausuren / my teacher's Bewertungsbogen, use them."
- "Make me a practice Schulaufgabe / Klausur / Abitur mock on <topic>."
- "Grade my answer", "How many points would this get?", "Why did you mark this?"
- "Help me get from 9 to 13 points", "What should I practise next?", "Am I improving?"

## Setup

```bash
SKILL=<path to this folder>
python3 $SKILL/scripts/examiner.py init          # creates ./english-examiner-data (or $EXAMINER_HOME)
python3 $SKILL/scripts/examiner.py status        # counts, pending items, next steps
```

Requirements: Python 3.9+, standard library only. Optional: `pypdf` or `pdftotext` for PDFs, `tesseract` (+ `pdftoppm`) for OCR. Without OCR, scans are marked `needs_transcription` and you transcribe them by viewing the image or PDF (see §2).

All commands print JSON. Errors print `{"error": …}` and exit with code 1. Read the error and fix the input; never work around a validator. Pass `--home DIR` before the command to choose the workspace. The workspace is private to the student (the directory is mode 0700). On platforms with ephemeral storage, offer `export backup.zip` at the end of a session.

## The eight sections

### 1. My Course Profile

`profile show`. Set the basics with `profile student --year-level 12 --course-level "eA (Leistungsfach)" --preferred-exam-format "…"`.

After analysing materials (§2), add entries as a JSON list with `profile add --json entries.json`. Each entry has `section`, `statement`, `provenance`, `confidence` and `evidence: [{material_id, quote?, location?}]`. Sections:
- `time_limit`, `exam_length`, `task_types`, `task_sequence`, `answer_length`
- `source_genres`, `topics`, `assessed_skills`
- `grading_criteria`, `task_wording`, `recurring_feedback`
- `structure_expectations`, `argument_and_evidence`, `language_expectations`
- `formatting_conventions`, `restrictions`, `course`, `other`

The CLI enforces the honesty rules: teacher rules need a verbatim quote, a pattern from one document is `provisional`, and nothing rests on an unconfirmed document.

Present the profile grouped by section, showing provenance, confidence and evidence for each entry, and say plainly what is provisional. The student can change anything: `profile edit pN --json changes.json`, `profile delete pN`. Run `profile audit` after materials change.

### 2. My Materials

1. **Upload**: `materials add f1.pdf f2.docx photo.jpg --topic "…" --year-level 12 --exam-type Klausur --date 2026-03 --importance high`. One call is one upload session. It accepts PDF, DOCX, TXT/MD, ODT/RTF (transcribe these), and PNG/JPG/HEIC/WEBP/TIFF up to 25 MB each. Every file is validated before anything is stored.
2. **Review**: `materials pending` lists what needs attention. For each material:
   - `materials show <id>` gives the extracted text, the grading-critical lines, and paths to the original and to the editable text file.
   - If the status is `needs_transcription`, look at the original (view the image, or read the PDF pages) and transcribe it faithfully, including handwritten teacher marks as `[[teacher comment: …]]`. Save it with `materials set-text <id> --file t.md --note "Claude transcription"`; the status stays `needs_review`, because the student must check it.
   - Show the student the text (or the relevant part) and ask them to confirm or correct it. Apply corrections with `set-text`, then run `materials reviewed <id>`.
   - DOCX teacher comments and tracked changes are preserved inline as `[[teacher comment: …]]`, `[[inserted: …]]` and `[[deleted: …]]`.
3. **Classify**: types are `exam_paper`, `source_text`, `task_instruction`, `model_answer`, `teacher_correction`, `rubric`, `vocabulary`, `student_answer` and `other`. The CLI makes a guess with a confidence level.
   - High-confidence guesses: confirm them as a batch ("I think these are: …, correct?").
   - Medium or low: ask about each one.
   - Then run `materials classify <id> <type>`.
   - A document holding several things (for example an exam with the student's answers and teacher corrections) gets its main type, and you mention the rest in the profile evidence `location`.
4. **Use**: `materials search "rhetorical" --type exam_paper --topic media`, `materials show <id> --segment 3` for large documents, `materials label <id> …`, `materials delete <id> --yes` (confirm with the student first), and `vocab from-material <id>` for vocabulary lists.

Large documents are split into segments of about 6000 characters, and grading-critical lines (points, criteria, word limits) are indexed for every segment. Read every segment of a rubric or exam paper before building the profile. Never skim past grading instructions.

### 3. Exam Blueprint

Ask briefly for whatever the student hasn't said, and offer the defaults:
- topic(s)
- materials to prioritise
- exam type
- difficulty: consolidation / realistic / stretch / abitur
- mode: practice / challenging / mock
- duration, number of tasks, word target
- whether to include personal vocabulary
- whether to follow one reference exam closely
- whether to focus on weaknesses
- "Match my teacher's format"

Then run `blueprint create --json bp.json`. Unspecified fields fall back to labelled defaults, which are listed in `defaults_used`; tell the student which ones applied.

### 4. Generate an Exam

Follow `references/exam-generation.md`. Write `exam.json` in the shape of `examples/exam.json`, then run `exam check --json exam.json` followed by `exam save --json exam.json`. The CLI checks:
- fictional texts are labelled
- authentic citations are verified
- points add up
- every task has hidden expectations
- the questions and texts aren't copied from the reference exams (originality)

For `abitur` difficulty, read `references/bavarian-context.md` and check the official guidance first.

### 5. Exam Room

`attempt start <exam_id> [--untimed]` creates the attempt and writes `exam_room.html`, a self-contained page that contains only what a student may see. It has:
- timer with pause, timed or untimed mode
- task navigation and an overview of completed tasks
- line-numbered sources
- word counts against the expected length
- autosave in the browser and a submit confirmation
- "Save progress file" / "Load progress file" to continue on another device
- a download or copy of the answer file

Give the student the HTML file to open on their device. Never show the exam JSON, hidden expectations or model answers before submission. If the student asks for hints during a timed exam, decline politely and offer to note the question for afterwards.

When the student returns the answer file: `attempt import answers-att_x.json`. If the page was submitted, this also submits the attempt. A student can also paste answers in chat: `attempt draft <id> --json answers.json`, then `attempt submit <id>` after they confirm.

Submission creates version 1, which is locked and read-only. Revisions never overwrite it: `attempt revise <id> --json new.json --note "after lab"` creates v2, v3 …, and `attempt compare <id> --from 1 --to 2` shows the changes.

### 6. My Results

Follow `references/grading.md`. Write the assessment in the shape of `examples/assessment.json`, then run `assess check` followed by `assess save`. The validator rejects:
- passages that aren't really in the answer
- quotations that aren't in the sources
- "corrected" excellent sentences
- percentage-to-points conversions without a teacher rubric
- invalid ranges
- grade promises

`assess save` writes an HTML report. Share it, and summarise the top three points in chat. `assess list` shows earlier results, and `assess report <id>` re-renders one.

### 7. 15-Point Improvement Lab

Part of every assessment (`lab`); follow `references/improvement-lab.md`. Afterwards, offer:
- (a) a revision of the answer, saved as a new version and graded again as v2 (it never replaces the v1 result)
- (b) the drills from the lab exercises
- (c) a short paragraph task on the same skill

### 8. My Weaknesses

- `weakness show`: the history and status of each skill. Statuses are `active`, `recurring`, `improving` and `secure_provisional` (three clean attempts in a row; one good attempt never counts as mastery).
- `weakness recommend`: focus skills, drill counts per skill, and the next difficulty. Difficulty goes up after two strong original submissions and down after two weak ones.
- `progress --html`: the dashboard (point ranges over time, weakness trends, active vocabulary use).

For the next exam, set `focus_weaknesses: true`. Design tasks that require the weak skills (for example, a comment task that demands a counterargument) and record them in `hidden.weakness_targets`.

## Vocabulary

`vocab import list.csv --topic media` accepts CSV, TSV, `;` or `term - meaning` lines. `vocab suggest --n 8` returns the words least used *in context*. Put them in `hidden.vocabulary_targets`, never in the visible tasks. Submission detects which targets were used, and the assessment's `vocab_usage` records whether each use was natural. Recognition is not mastery.

## Data control

- `export ~/english-backup.zip` exports everything.
- `materials delete <id> --yes` deletes one item.
- `purge --yes --confirm english-examiner-data` deletes everything (it is irreversible: confirm with the student in chat first).

## Validation and tests

```bash
python3 -m unittest discover -s $SKILL/tests     # or: pytest $SKILL/tests
```

## Files

- `scripts/examiner.py`: the CLI. Its package is `scripts/examiner/`: store, extract, materials, profile, exams, attempts, assessment, weaknesses, vocab, render, schema.
- `assets/schemas/*.json`: blueprint, exam and assessment schemas.
- `assets/exam_room.html`, `assets/report.css`: page templates.
- `examples/`: fictional reference exam, rubric, generated exam, answers and assessment. The `__PLACEHOLDER__` IDs in `assessment.json` stand for real record IDs.
- `references/`: honesty-rules, grading, exam-generation, improvement-lab, bavarian-context.
