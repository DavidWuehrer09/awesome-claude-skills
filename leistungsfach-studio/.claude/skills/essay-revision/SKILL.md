---
name: essay-revision
description: Build or change the Revision Studio — sentence-level revision prompt and RevisionOutput schema, sentence segmentation, word-level diff and the green/yellow/blue/red change rendering, the eight change categories, per-change explanations, accepting/rejecting changes and the readable final version. Use when touching src/lib/text/*, src/lib/ai/prompts/revision.ts (revision and explanation prompts), src/server/services/revision.ts, or src/components/revision/*, or when an improved version misrepresents the student's meaning.
---

# Revision Studio

Pedagogical rules for what a good revision is come from the **bavarian-english-leistungsfach** Skill (§6 effect chain, §8 principles). This Skill covers the mechanics and the revision-specific constraints.

## Data flow

```
essay text ──segmentSentences()──► [{id:"p1s1", text}, …]   src/lib/text/segment.ts (pure, tested)
           ──revision prompt──► RevisionOutput.edits[]       one entry per changed sentence/range only
                                 { target_ids, revised_text, category, explanation, principle, how_to_apply,
                                   is_new_idea, needs_evidence_note }
           ──validateRevision()──► ids exist, ranges contiguous, unchanged sentences not echoed as edits
           ──buildRevisionDocument()──► segments with word-level ops   src/lib/text/diff.ts
```

Unchanged sentences are **not** sent back by the model; the code reuses the original text verbatim, so "retained" is guaranteed to be truly retained.

## "Aim for 15" (depth `exemplary`)

The student's explicit request: a full upgrade to the strongest 15-point version, plus guidance to get there independently.
- One click (essay page or Examiner, `src/lib/client/aimFor15.ts`): strict assessment → `exemplary` revision → Revision Studio.
- The prompt may revise every sentence that is not already at 15-point level, but must keep the student's core ideas, mark added ideas `is_new_idea`, and stay natural (never ornate, archaic or showy).
- `phrase_upgrades` (original verbatim from the essay → upgraded, why, when_to_use) and `ideas_for_15` (concrete actions ordered by impact, where, evidence needed) are stored in `revisions.coaching` and shown by `src/components/revision/CoachingPanel.tsx`. The validator requires ≥ 3 ideas, and ≥ 3 phrase upgrades for essays of ≥ 4 sentences; both are empty for `corrections`.
- Saving a phrase upgrade puts it in the vocabulary bank. It counts as learned only after the student uses it correctly in an original sentence.
- Never promise the rewrite would score 15. It is the target, and the strict assessment shows the distance.

## Colour and label contract (accessibility)

| Op | Colour token | Label (always rendered, not colour-only) |
| --- | --- | --- |
| retained | `--diff-retained` (green) | "kept" |
| modified | `--diff-modified` (yellow) | "changed" + tooltip/inspector shows original → new |
| added | `--diff-added` (blue) | "added" |
| removed | `--diff-removed` (red, strikethrough) | "removed" |

Modified = an adjacent removed+added word run inside an edited sentence (diff.ts pairs them). Colours must meet WCAG AA against the background in light and dark themes; the legend is always visible; screen readers get `<ins>`/`<del>` semantics plus visually-hidden labels.

## Categories (exact keys)

`grammar`, `idiomatic`, `precision`, `structure_cohesion`, `deeper_analysis`, `argumentation`, `evidence`, `register_genre`.

## Constraints

- **Preserve voice and meaning.** Prompt instructs minimal intervention by depth level: `corrections` (errors only), `targeted` (errors + the assessment's top priorities), `exemplary` ("Aim for 15": the strongest 15-point version of *this* essay, see below).
- An edit that introduces content the student did not write sets `is_new_idea: true` and must say what evidence from the source would justify it. UI shows a "new idea — needs justification" marker.
- Never put quotation marks around words that are not in the source text or essay (validator checks quoted strings).
- Accepting a revision is **not** learning evidence (learner-modelling Skill). The UI may offer "try it yourself" exercises instead.
- Rejected edits revert to the original sentence in the final version; state stored per revision (`edit_states`).

## Workflow: changing the diff renderer

1. Change `src/lib/text/diff.ts`; run `npm test -- text` and `npm test -- scoring` (cover punctuation, quotes, line refs like "(l. 12)", contractions, multi-sentence ranges, empty edits).
2. Check the Revision Studio in both themes and at 375 px width; tab through changes (←/→ or j/k move between changes, Enter opens inspector).

## Example

Original sentence `p2s3`: "The author uses many stylistic devices to make the reader think about the topic."
Good edit (`deeper_analysis`, targeted):
```json
{ "target_ids": ["p2s3"],
  "revised_text": "By juxtaposing the official statistics with a single family's story (ll. 14–18), the author forces readers to see the human cost behind the numbers.",
  "category": "deeper_analysis",
  "explanation": "The original names devices generically and states a cliché effect.",
  "principle": "Name the specific technique, anchor it in the text, and state the precise effect.",
  "how_to_apply": "For each device ask: what exactly does the reader now feel/think that they would not otherwise?",
  "is_new_idea": true,
  "needs_evidence_note": "Only valid if lines 14–18 really contrast statistics with a family story — check the source." }
```
