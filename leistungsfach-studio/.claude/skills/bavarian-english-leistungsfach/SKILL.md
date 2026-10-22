---
name: bavarian-english-leistungsfach
description: Curricular foundation for the Bavarian Gymnasium English Leistungsfach (erhöhtes Anforderungsniveau, Jahrgangsstufe 12/13, Abitur from 2026). Defines the evidence-labelled requirements, exam format, task types and operators, assessment dimensions and 0–15 band descriptors, grading modes, analytical expectations, and teaching principles that the Training Studio's runtime tutor must implement. Use whenever you change curriculum data (src/lib/curriculum), assessment rubrics, task types, scoring rules or any prompt that makes claims about Bavarian requirements, or when you check that the app's tutor behaviour matches the curriculum.
---

# Bavarian English Leistungsfach: curricular foundation

This is the **canonical curriculum reference** for the project. The other five Skills (essay-assessment, essay-revision, learner-modelling, adaptive-tutoring, progress-evaluation) build on it and must not redefine its content. The deployed app does not read this file: its runtime equivalent is `src/lib/curriculum/` (structured data) plus `src/lib/ai/prompts/shared.ts` (rules rendered into prompts). **Any change here must be mirrored there**, and `tests/unit/curriculum-consistency.test.ts` checks that the task-type keys, dimension keys and source IDs in this file match the runtime data.

The research behind this file, with full URLs and limitations, is in `docs/CURRICULUM_RESEARCH.md`. Read it before adding a new curriculum claim.

---

## 1. Provenance labels: every claim carries one

| Label | Meaning | How the app may present it |
| --- | --- | --- |
| `official_verified` | The student or a developer read the official document and pasted or quoted the passage (`curriculum_notes` table) | "The LehrplanPLUS states …" |
| `official_reported` | An official document reported via a search extract or summary; not fully read | "Official guidance reportedly states … (unverified)" |
| `teacher_specific` | The student's own teacher: entered feedback, marking schemes, scores | "Your teacher's feedback suggests …" (never generalised) |
| `interpretation` | Sound upper-secondary EFL practice and our reading of the curriculum | "A strong eA answer typically …" |
| `ai_suggestion` | An optional idea from the tutor | "You could try …" |

Rules:
- Never upgrade a label. A search summary is not "verified".
- Never invent grading weights, point bands, operator definitions or topic lists and present them as official.
- When official and teacher evidence conflict, show both and say which applies to what (the Abitur vs. this teacher's Klausur).
- If a requirement is unknown, say so ("The official topic list could not be retrieved; add it in Curriculum sources").

## 2. What the curriculum requires (evidence status in brackets)

Source IDs (S1–S13) refer to `docs/CURRICULUM_RESEARCH.md`.

### 2.1 Course
- English eA is a five-lesson Leistungsfach in Years 12 and 13 [S5, official_reported].
- The competences describe the outcome of a **two-year** process [S1, official_reported]. Do not treat Year 12 work as if it should already meet the final Abitur standard in every respect; say how far the work is from the end-of-13 expectation.

### 2.2 What makes eA different from gA
The basic competences apply at both levels. eA differs through [S3, S5, official_reported]:
- **Complexity**: more demanding tasks, longer and more complex authentic texts, more abstract topics.
- **Depth and breadth**: more nuanced, more thorough treatment of content.
- **Independence (Selbstständigkeit)**: planning and carrying out writing without scaffolding.
- **Precision**: of language, structure and analysis.

Competence expectations reported for eA [S1/S2, official_reported, partly verbatim]:
- Reading: recognise explicit **and implicit** statements and **analyse their intended effect (Wirkungsabsicht)** in complex texts.
- Writing (12): plan writing processes independently throughout, and write accurately and appropriately for the addressee ("sprachlich korrekt sowie adressatengerecht"). Write complex texts on a broad range of topics and engage with different positions in an **argumentative, differentiated and nuanced** way.
- Writing (13): independently write complex argumentative texts adapted to addressee and situation.
- Text and media: analyse literary and non-literary texts **with textual evidence**, and the effect of design features.
- Listening: includes implicit attitudes and relationships between speakers.

### 2.3 Written Abitur (G9, from 2026) [S5–S8, official_reported]
| Part | Content | Time | Weight |
| --- | --- | --- | --- |
| A | Listening (Hörverstehen) | about 30 min | 20 % |
| B | Writing (Schreiben): non-literary **or** literary task. Sub-tasks: 1 comprehension, 2 analysis, 3 a choice of comment (Stellungnahme) **or** creative writing (gestaltendes Schreiben) | 285 min eA, shared between B and C | 55 % |
| C | Mediation (Sprachmittlung), German → English; source(s) up to 650 words, possibly discontinuous | (included above) | 25 % |

- The writing source text is at most 1000 words at eA.
- Topics come from a **binding list of Themengebiete** in the LehrplanPLUS. This list could not be retrieved, so the app must not list official topics unless the student has added them as `official_verified`.
- A new operator set applies from the **2027** exam year [S10, official_reported]. Its content could not be retrieved, so the operator guidance in §3 is `interpretation`.
- The app cannot run listening comprehension. It says so, and points to the ISB's illustrative tasks (S7).

### 2.4 Assessment [S9, S11, S12, official_reported]
- Writing and mediation sub-tasks are marked separately on **0–15 Notenpunkte**, using mandatory ISB Bewertungsraster.
- The rubrics have two columns: **"Inhalt und Textstruktur"** (operator fulfilment, grasp of the text's message, structure) and **"Sprache"** (range of grammar, vocabulary, syntax, idiom and text-structuring devices, plus accuracy).
- Reported combination rule: **content : language = 40 : 60**, and a content mark below 3 points caps the sub-task at 3 points. This is `official_reported` and may date from the 2020 KMS. The app applies it by default with a visible "reported, unverified" label, and the student can switch it off.
- The Abitur rubric tables are published each March as an annex to a KMS. The exact descriptor wording was **not** retrieved. The band descriptors in §5 are `interpretation`, written to be consistent with the two-column structure.
- 15 points means "exceptional" relative to the eA standard. It does **not** mean "native-speaker perfect".

## 3. Task types and operators (`src/lib/curriculum/taskTypes.ts`)

Task-type keys are stable identifiers; the consistency test reads this table. The operator glosses are `interpretation` until the 2027 operator list is verified.

| Key | Task type | Typical operators | Abitur place |
| --- | --- | --- | --- |
| `comprehension` | Text comprehension (outline, describe, point out) | outline, describe, point out, state | B sub-task 1 |
| `summary` | Summary | summarise, sum up | Classwork; part of comprehension |
| `nonfiction_analysis` | Non-fictional text analysis incl. rhetorical analysis | analyse, examine, explain | B sub-task 2 (non-literary) |
| `literary_analysis` | Literary analysis and interpretation | analyse, interpret, examine | B sub-task 2 (literary) |
| `characterisation` | Characterisation and narrative perspective | characterise, analyse (perspective) | B sub-task 2 (literary) |
| `comparative_analysis` | Comparative analysis | compare, contrast | B sub-task 2/3 |
| `comment` | Comment and discussion | comment, discuss, assess, evaluate | B sub-task 3 (Stellungnahme) |
| `creative_writing` | Creative / re-creative writing | write (interior monologue, letter, diary, continuation, dialogue) | B sub-task 3 (gestaltendes Schreiben) |
| `speech` | Speech and audience-oriented writing | write a speech / article / letter to the editor / blog post | B sub-task 3 / classwork |
| `mediation` | Mediation (Sprachmittlung) | write (an email, article, …) for a named addressee, based on German material | C |

What each operator demands, and its typical pitfall:
- **outline / describe / point out**: the selected aspects only, neutral, own words, no interpretation. *Pitfall:* retelling or evaluating.
- **summarise**: the main points, condensed, simple present, own words, no quotations, no opinion, a framing introductory sentence. *Pitfall:* detail creep, quoting, chronological retelling.
- **analyse / examine**: technique → evidence (quote + line) → **function in context** → **effect on the reader** → **contribution to purpose**. *Pitfall:* listing devices ("feature-spotting").
- **interpret**: a reasoned, evidence-based reading of meaning, including ambiguity and alternative readings. *Pitfall:* assertion without support, or plot summary.
- **characterise**: traits that are inferred (indirect) and stated (direct) characterisation, each with evidence, plus development and function in the text. *Pitfall:* retelling the plot.
- **compare / contrast**: criteria-led comparison, point by point, of similarities **and** differences, ending in a conclusion. *Pitfall:* two separate summaries.
- **comment / discuss / assess / evaluate**: a clear position; developed arguments with examples; a counter-position that is acknowledged **and** answered; weighing; a conclusion that follows from the argument. *Pitfall:* listing points, a straw-man counterargument, or a conclusion that ignores the argument.
- **creative writing**: consistent with the source (characters, facts, perspective, tone), the conventions of the required text type, and a recognisable link to the source's themes. *Pitfall:* contradicting the source, or ignoring the text type.
- **speech / audience-oriented writing**: addressee, purpose and occasion; rhetorical strategies used with purpose; the right register and genre conventions (salutation, framing). *Pitfall:* an essay with "Dear audience" added.
- **mediate**: purpose- and addressee-oriented transfer of **selected** relevant content, adapted (cultural explanation where needed), never a literal translation; the required text type. *Pitfall:* translating everything, or including irrelevant details.

## 4. Assessment dimensions (`src/lib/curriculum/dimensions.ts`)

Dimensions are grouped by the official rubric columns. Each task type selects the dimensions that apply and weights them (the weights are `interpretation`). Do not apply one checklist mechanically: a summary is not marked for argumentation, and a mediation is not marked for device analysis.

**Content & structure** (`content` group)
| Key | Dimension | Looks for |
| --- | --- | --- |
| `task_fulfilment` | Task fulfilment & operator | Does exactly what the operator asks; focus; scope; length |
| `comprehension` | Understanding of the material | Accurate grasp of explicit and implicit meaning |
| `analytical_depth` | Analytical depth | Function, effect, significance, link to purpose; not naming devices for their own sake |
| `interpretation` | Interpretation | Plausible, nuanced, evidence-based readings; awareness of ambiguity |
| `evidence_use` | Evidence | Relevant, well-chosen, smoothly integrated quotations and references with line numbers; evidence explained, not just dropped in |
| `argumentation` | Argumentation | Clear position, development, examples, counter-position plus rebuttal, weighing |
| `structure_cohesion` | Structure & cohesion | Logical organisation, paragraphing, purposeful introduction and conclusion, transitions |
| `selection_condensing` | Selection & condensing | Relevant information selected and condensed (summary, mediation) |
| `addressee_purpose` | Addressee, purpose & text type | Fit to audience, situation, conventions (speech, mediation, creative) |
| `source_consistency` | Consistency with the source | Creative writing that stays true to characters, facts and perspective |

**Language** (`language` group)
| Key | Dimension | Looks for |
| --- | --- | --- |
| `grammar_accuracy` | Grammar & accuracy | Errors that are frequent or impede meaning count more than slips |
| `vocabulary_precision` | Vocabulary range & precision | Precise, task-appropriate words; analytical metalanguage |
| `idiomaticity` | Idiomaticity & collocations | Natural collocations; no German interference ("make a photo") |
| `syntax_style` | Sentence variety & stylistic control | Control of complex syntax and variety, with clarity first |
| `register_conventions` | Register & genre language | Formality, tense conventions (summary: simple present), no contractions in formal writing, genre-specific language |

Task-type weights (content group / language group):
- `comprehension`: task_fulfilment 3, comprehension 4, selection_condensing 2, structure_cohesion 1 / grammar 3, vocabulary 2, idiomaticity 2, syntax 1, register 2
- `summary`: task_fulfilment 3, comprehension 3, selection_condensing 4, structure_cohesion 1 / grammar 3, vocabulary 2, idiomaticity 2, syntax 1, register 2
- `nonfiction_analysis`: task_fulfilment 2, comprehension 2, analytical_depth 4, evidence_use 3, structure_cohesion 2 / grammar 3, vocabulary 3, idiomaticity 2, syntax 2, register 1
- `literary_analysis`: task_fulfilment 2, comprehension 2, analytical_depth 3, interpretation 3, evidence_use 3, structure_cohesion 2 / as nonfiction_analysis
- `characterisation`: task_fulfilment 2, comprehension 2, interpretation 3, analytical_depth 2, evidence_use 3, structure_cohesion 2 / as nonfiction_analysis
- `comparative_analysis`: task_fulfilment 3, comprehension 2, analytical_depth 3, evidence_use 2, structure_cohesion 3 / as nonfiction_analysis
- `comment`: task_fulfilment 2, argumentation 5, structure_cohesion 3, evidence_use 1 / grammar 3, vocabulary 3, idiomaticity 2, syntax 2, register 1
- `creative_writing`: task_fulfilment 2, source_consistency 4, addressee_purpose 3, structure_cohesion 1 / grammar 3, vocabulary 3, idiomaticity 2, syntax 2, register 2
- `speech`: task_fulfilment 2, addressee_purpose 4, argumentation 3, structure_cohesion 2 / grammar 3, vocabulary 3, idiomaticity 2, syntax 2, register 2
- `mediation`: task_fulfilment 2, selection_condensing 4, addressee_purpose 4, comprehension 1 / grammar 3, vocabulary 3, idiomaticity 2, syntax 1, register 2

## 5. Band descriptors (0–15), `interpretation`

General meaning of the bands for an eA piece. A dimension's range is chosen by matching the evidence, never by impression:

| Points | Band | Content & structure | Language |
| --- | --- | --- | --- |
| 13–15 | Exceptional | Fulfils the operator completely and independently; insightful, nuanced, precise; every claim supported; the structure serves the argument | Wide, precise, idiomatic repertoire; complex syntax under control; errors rare and minor; register consistently apt |
| 10–12 | Good | Fulfils the task well; mostly developed analysis or argument with some unevenness; good evidence; clear structure | Good range; mostly idiomatic; some errors that do not impede understanding |
| 7–9 | Satisfactory | Fulfils the task in essentials; partly descriptive or generalised; evidence present but not always explained; structure recognisable | Adequate but limited or repetitive range; noticeable interference; errors sometimes distract |
| 4–6 | Weak, with deficiencies | Task partly missed; mainly retelling or listing; little explanation; weak structure | Limited range; frequent errors; meaning sometimes unclear |
| 1–3 | Serious deficiencies | Task largely missed; content fragmentary or inaccurate | Errors pervasive; meaning often obscured |
| 0 | No assessable performance | Off-task or absent | Not assessable |

Distinctions that separate the top bands at eA:
- **9 → 12**: from "identifies devices and gives a general effect" to "explains the specific effect in context and links it to the purpose".
- **12 → 15**: from good analysis to **independent, nuanced insight**. For example: tension between strategies, how the effect depends on the intended audience, limits or ambiguity of the text's persuasiveness, a precise and economical expression throughout.
- Language at 15 is not ornate: it is **precise, natural and controlled**. Elaborate vocabulary that sounds unnatural lowers the language mark.

## 6. Analytical expectations: the effect chain

For any analysis-type task, an excellent point follows this chain:

1. **Claim**: what the author does (strategy, not just the device name).
2. **Evidence**: a short, integrated quotation with a line reference ("… 'a generation betrayed' (l. 12) …").
3. **Function in context**: what the device does *here*.
4. **Effect**: on the intended reader (emotional, cognitive, persuasive).
5. **Significance**: how it serves the author's wider purpose or the text's meaning.
6. *(eA top band)* **Evaluation or nuance**: how effective it is, for whom, and with what limits.

Example (non-fictional, `interpretation`):
- Weak (6–8 points): "The author uses a metaphor in line 12 to make the text more interesting."
- Adequate (9–10): "The metaphor 'a generation betrayed' (l. 12) shows that young people have been treated unfairly."
- Strong (11–13): "By calling young people 'a generation betrayed' (l. 12), the author recasts an economic statistic as a moral failure, which invites readers to share his indignation rather than merely note the figures."
- Exceptional (14–15): the above, plus "… although this emotive framing risks alienating the older readers whose votes the article implicitly needs to change."

Recognise these failure patterns:
- **Feature-spotting**: listing devices with no function.
- **Effect clichés**: "to make the reader think", "to emphasise", "to make it more interesting" with no specific content.
- **Paraphrase posing as analysis**: restating what the text says.
- **Unanchored claims**: no quotation or line reference.
- **Quotation dumping**: long quotes, unexplained.

## 7. Grading modes

All three modes use the **same dimensions, evidence and arithmetic**. They differ only in how borderline evidence is resolved and how the feedback is framed:

| Mode | Borderline cases | Framing | Use |
| --- | --- | --- | --- |
| `supportive` | Resolve towards the higher band when the evidence genuinely allows both | Strengths first; at most three priorities; still names every major weakness | After a hard week; first drafts |
| `teacher_standard` | Resolve as the evidence most likely supports; uses teacher-calibration evidence if available (labelled) | Balanced | Realistic estimate |
| `strict` | Resolve towards the lower band; requires explicit evidence for every top-band claim | Stress test: "what stops this being 15?" | Before exams; when aiming for 15 |

Non-negotiable in every mode:
- Give a **range** (for example 10–12) and a confidence level (`low`, `medium` or `high`). Explain what would narrow the range.
- Never promise or predict an official grade. Say "estimate", not "your grade".
- Never invent deductions, quotations, rubric rules or teacher preferences.
- Separate **major conceptual weaknesses** (task missed, no analysis, no counterargument) from **minor language errors**.
- If the task, source text or operator is missing, lower the confidence and say why.

## 8. Teaching principles (all tutoring features)

1. **Diagnose before prescribing.** Name the cause of a weakness (for example "you describe rather than explain effect"), not just the symptom.
2. **Prioritise by impact on the mark.** Address the three highest-value issues first. A missing counterargument outweighs ten comma slips.
3. **Preserve the student's voice.** Improve what the student meant; mark any new idea explicitly as new, along with the evidence it would need.
4. **Active over passive.** Practice that requires producing language beats reading a model answer. Show model answers after an attempt.
5. **Transfer is the test.** A skill counts as learned only when it is applied unprompted in a new text or task.
6. **Precision over ornament.** Recommend C1–C2 expressions only when they are more precise and natural here.
7. **Honest encouragement.** Real strengths, quoted from the student's work; no flattery.
8. **Spaced and interleaved.** Revisit recurring errors and vocabulary over increasing intervals.

## 9. How this maps into the runtime app

| This section | Runtime file |
| --- | --- |
| §1 labels | `src/lib/curriculum/sources.ts` (`Provenance`), shown in the UI by `ProvenanceBadge` |
| §2 requirements | `src/lib/curriculum/framework.ts` (`EA_REQUIREMENTS`, `ABITUR_FORMAT`, `ASSESSMENT_RULES`) |
| §3 task types and operators | `src/lib/curriculum/taskTypes.ts` |
| §4 dimensions and weights | `src/lib/curriculum/dimensions.ts`, `src/lib/curriculum/taskTypes.ts` |
| §5 bands | `src/lib/curriculum/framework.ts` (`BANDS`, `BAND_DISTINCTIONS`) |
| §6 effect chain | `src/lib/ai/prompts/shared.ts` (`ANALYSIS_EXPECTATIONS`) |
| §7 modes | `src/lib/curriculum/framework.ts` (`MODE_INFO`), `src/lib/ai/prompts/assessment.ts` |
| §8 principles | `src/lib/ai/prompts/shared.ts` (`TEACHING_PRINCIPLES`) |
| Score arithmetic (40/60, cap) | `src/lib/scoring/aggregate.ts` |

## 10. Workflow: changing curriculum content

1. Find or record the source in `docs/CURRICULUM_RESEARCH.md`, with its URL and evidence label.
2. Update this file (the canonical version).
3. Mirror the change in `src/lib/curriculum/*`, keeping keys identical.
4. Run `npm test -- curriculum`. The consistency test must pass.
5. If a prompt's wording changes, bump its `PROMPT_VERSION`, so stored assessments stay traceable.

Example: the student pastes the verified 2027 operator list.
- Add an `official_verified` note through the UI (stored in `curriculum_notes`). The runtime injects verified notes into prompts automatically.
- Change the operator glosses in §3 and `taskTypes.ts` from `interpretation` to `official_verified` only for the operators the pasted list actually covers.
