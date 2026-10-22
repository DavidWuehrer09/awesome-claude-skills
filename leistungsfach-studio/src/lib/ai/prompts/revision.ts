import type { RevisionOutput, ExplanationOutput } from "@/lib/ai/schemas";
import { TASK_TYPES, type TaskTypeKey } from "@/lib/curriculum";
import { containsQuote, extractQuotedStrings, normalizeForMatch } from "@/lib/text/normalize";
import { renderNumberedSentences, type Sentence } from "@/lib/text/segment";
import { ANALYSIS_EXPECTATIONS, escapeBlock, renderCurriculumGeneral, SHARED_RULES, TEACHING_PRINCIPLES } from "./shared";

export const REVISION_PROMPT_VERSION = "revision-1.0";
export const EXPLANATION_PROMPT_VERSION = "explanation-1.0";

import { REVISION_DEPTHS, type RevisionDepth } from "@/lib/ai/depths";
export { REVISION_DEPTHS, type RevisionDepth };

const DEPTH_RULES: Record<RevisionDepth, string> = {
  corrections: "Fix genuine errors only (grammar, wrong word, unidiomatic collocation, register slips). Keep wording, structure and ideas otherwise unchanged. Do not touch correct sentences.",
  targeted: "Fix genuine errors, and improve the passages most relevant to the assessment's top priorities (listed below). Leave sentences that already work unchanged. Typically 25–50 % of sentences change.",
  exemplary: "Show what a 13–15-point version of THIS essay could look like: keep the student's structure, ideas and voice where they work; deepen analysis, sharpen argument and language where they do not. Every added idea must be marked is_new_idea with the evidence it needs. Still leave strong sentences unchanged.",
};

export const REVISION_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

${ANALYSIS_EXPECTATIONS}

${renderCurriculumGeneral()}

<revision_rules>
You are the revision coach. You receive the student's essay split into numbered sentences, e.g. [p2s3]. Return ONLY the sentences you change, as edits.
- target_ids: one or more CONSECUTIVE sentence ids from the SAME paragraph that your revised_text replaces. Each id at most once across all edits.
- revised_text: the replacement. To add a new sentence, include the original sentence plus the new one in revised_text. To delete, use "".
- Never return an edit whose revised_text is identical to the original.
- category (choose the main reason): grammar | idiomatic | precision | structure_cohesion | deeper_analysis | argumentation | evidence | register_genre.
- explanation: what was wrong or weaker. principle: the general rule. how_to_apply: how the student can do this independently next time (a concrete self-check).
- is_new_idea: true when you add content (an argument, interpretation, example, evidence) the student did not write; needs_evidence_note then states what in the source text would justify it. Correcting or clarifying the student's own idea is not a new idea.
- Preserve the student's meaning and voice. Do not make language more ornate than needed; natural precision is the goal.
- Only put words in quotation marks if they appear verbatim in the source text or essay.
- overview: 2–4 sentences on the focus of the revision and what was deliberately kept.
</revision_rules>`;

export function buildRevisionPrompt(input: {
  depth: RevisionDepth; taskType: TaskTypeKey; operator: string; taskPrompt: string; sourceText: string;
  sentences: Sentence[]; priorities: string[];
}) {
  const t = TASK_TYPES[input.taskType];
  const user = `<task_type key="${t.key}">${t.label}. Operator demands: ${t.guide.demands}</task_type>
<depth name="${input.depth}">${DEPTH_RULES[input.depth]}</depth>
<assessment_priorities>
${input.priorities.length ? input.priorities.map((p) => `- ${p}`).join("\n") : "- (no assessment yet: focus on the most valuable improvements)"}
</assessment_priorities>
<current_task>
Operator: ${escapeBlock(input.operator || "(not given)")}
Task prompt: ${escapeBlock(input.taskPrompt || "(not given)")}
</current_task>
<source_text>
${input.sourceText.trim() ? escapeBlock(input.sourceText) : "(none provided)"}
</source_text>
<essay_sentences>
${escapeBlock(renderNumberedSentences(input.sentences))}
</essay_sentences>`;
  return { system: REVISION_SYSTEM, user };
}

export function validateRevision(out: RevisionOutput, input: { sentences: Sentence[]; sourceText: string; essayText: string }): string[] {
  const problems: string[] = [];
  const order = new Map(input.sentences.map((s, i) => [s.id, i]));
  const byId = new Map(input.sentences.map((s) => [s.id, s]));
  const used = new Set<string>();
  if (out.edits.length === 0) problems.push("edits is empty — return at least one improvement, or explain in overview if the essay needs none (then still return one edit for the most valuable refinement).");
  out.edits.forEach((e, n) => {
    const label = `edit ${n + 1}`;
    if (!e.target_ids.length) { problems.push(`${label}: target_ids is empty.`); return; }
    const idx: number[] = [];
    for (const id of e.target_ids) {
      if (!order.has(id)) problems.push(`${label}: unknown sentence id "${id}".`);
      else idx.push(order.get(id)!);
      if (used.has(id)) problems.push(`${label}: sentence "${id}" is already used by another edit.`);
      used.add(id);
    }
    if (idx.length === e.target_ids.length) {
      const sorted = [...idx].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) problems.push(`${label}: target_ids must be consecutive.`);
      const paras = new Set(e.target_ids.map((id) => byId.get(id)!.paragraph));
      if (paras.size > 1) problems.push(`${label}: target_ids must be in the same paragraph.`);
      const original = e.target_ids.map((id) => byId.get(id)!.text).join(" ");
      if (normalizeForMatch(original) === normalizeForMatch(e.revised_text)) problems.push(`${label}: revised_text is identical to the original; omit unchanged sentences.`);
    }
    for (const q of extractQuotedStrings(e.revised_text)) {
      if (!containsQuote(input.sourceText, q) && !containsQuote(input.essayText, q)) problems.push(`${label}: quoted words "${q.slice(0, 60)}" do not appear in the source text or essay.`);
    }
    if (e.is_new_idea && !e.needs_evidence_note) problems.push(`${label}: a new idea needs needs_evidence_note.`);
  });
  return problems;
}

export const EXPLANATION_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

<explanation_rules>
The student wants to understand one change in their revised essay deeply enough to apply it independently.
- explanation: why the original was weaker and why the change works here (refer to the task and text).
- principle: the transferable rule in one or two sentences.
- examples: 2–3 NEW before/after pairs on different content (not copied from the essay).
- common_mistakes: 2–3 ways students misapply this principle.
- practice: a short instruction plus 3 items the student can try (no answers).
- self_check: one question to ask while writing.
If the student asked a question, answer it directly in explanation. If the change was debatable, say so honestly.
</explanation_rules>`;

export function buildExplanationPrompt(input: { original: string; revised: string; category: string; explanation: string; principle: string; taskType: TaskTypeKey; question: string }) {
  return {
    system: EXPLANATION_SYSTEM,
    user: `<task_type>${TASK_TYPES[input.taskType].label}</task_type>
<change category="${input.category}">
Original: ${escapeBlock(input.original || "(nothing — text was added)")}
Revised: ${escapeBlock(input.revised || "(removed)")}
Brief reason given: ${escapeBlock(input.explanation)}
Principle given: ${escapeBlock(input.principle)}
</change>
<student_question>${escapeBlock(input.question || "(none — explain the change in depth)")}</student_question>`,
  };
}

export function validateExplanation(out: ExplanationOutput): string[] {
  const p: string[] = [];
  if (out.examples.length < 1) p.push("give at least one new example.");
  if (out.practice.items.length < 1) p.push("practice needs at least one item.");
  return p;
}
