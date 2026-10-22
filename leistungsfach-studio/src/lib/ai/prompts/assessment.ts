import { MODE_INFO, TASK_TYPES, taskTypeDimensions, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";
import type { AssessmentOutput } from "@/lib/ai/schemas";
import { containsQuote } from "@/lib/text/normalize";
import { SKILL_KEYS } from "@/lib/learner/skills";
import {
  ANALYSIS_EXPECTATIONS, escapeBlock, renderCurriculumGeneral, renderSkillCatalogue, renderTaskTypeBlock,
  renderVerifiedNotes, SHARED_RULES, TEACHING_PRINCIPLES, type VerifiedNote,
} from "./shared";

export const ASSESSMENT_PROMPT_VERSION = "assessment-1.0";

export type AssessmentPromptInput = {
  mode: AssessmentMode;
  taskType: TaskTypeKey;
  operator: string;
  taskPrompt: string;
  sourceText: string;
  essayText: string;
  rubricText: string;
  wordCount: number;
  context: string;
  timeLimitMinutes: number | null;
  timeUsedMinutes: number | null;
  learnerSummary: string;
  teacherCalibration: string;
  verifiedNotes: VerifiedNote[];
};

export const ASSESSMENT_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

${ANALYSIS_EXPECTATIONS}

${renderCurriculumGeneral()}

${renderSkillCatalogue()}

<assessment_rules>
You are the essay examiner. Assess the student's essay against the task, the material and the task type's dimensions.
Procedure:
1. Read the task, operator and material first; state in task_understanding what the operator requires.
2. Read the whole essay before judging details. Decide what matters most for the mark.
3. For EACH dimension listed in the task type block (and only those), give a 0–15 range (low ≤ best ≤ high) that matches the band descriptors, with a rationale and 1–3 verbatim evidence quotes from the essay. A narrower range means more certain; use a range of at least 2 points when the evidence is mixed or material is missing.
4. Strengths: 2–4, each with a verbatim quote and why it works.
5. Weaknesses: the most consequential first. severity "major" = conceptual/task-level (operator missed, description instead of analysis, no counter-argument, misreading, missing evidence); "minor" = local. kind "language" for grammar/lexis/register. Group repeated small errors into one weakness with several quotes. Never more than 8 weaknesses.
6. Action plan: 3–5 prioritised, concrete actions, each tied to one skill key from the skill catalogue.
7. holistic_check: your own independent overall range — it is only a cross-check; the app computes the score from the dimensions.
8. confidence: "low" if the task prompt or required source text is missing, the essay is very short, or the task type seems mismatched; explain in uncertainty_notes what would make the estimate more reliable.
9. curriculum_references: name the expectations you applied with provenance labels. Teacher-calibration information is "your teacher", never "official".
10. vocabulary_suggestions: 0–5 precise, natural expressions that would have helped in THIS essay (no showy or archaic words).
Quotes must be copied exactly from the essay (you may shorten with "..." between exact fragments).
</assessment_rules>`;

export function buildAssessmentPrompt(input: AssessmentPromptInput): { system: string; user: string } {
  const mode = MODE_INFO[input.mode];
  const t = TASK_TYPES[input.taskType];
  const missing: string[] = [];
  if (!input.taskPrompt.trim()) missing.push("No task prompt was provided.");
  if (t.needsSourceText && !input.sourceText.trim()) missing.push("This task type normally needs a source text, but none was provided.");
  const user = `${renderTaskTypeBlock(input.taskType)}

<mode name="${input.mode}">
${mode.label}: ${mode.short}
Borderline cases: ${mode.borderline}
Framing: ${mode.framing}
The arithmetic and dimensions are identical in every mode; only borderline resolution and framing differ.
</mode>

${renderVerifiedNotes(input.verifiedNotes)}

<teacher_calibration provenance="your teacher">
${input.teacherCalibration || "No teacher calibration data yet."}
</teacher_calibration>

<learner_context>
${input.learnerSummary || "No previous evidence about this learner yet."}
Use this only to make feedback more useful (e.g. note if a known recurring error appears again). Do not let it bias the scores: assess this essay on its own evidence.
</learner_context>

<current_task>
Operator: ${escapeBlock(input.operator || "(not given)")}
Task prompt: ${escapeBlock(input.taskPrompt || "(not given)")}
Context: ${input.context}${input.timeLimitMinutes ? `; time limit ${input.timeLimitMinutes} min` : ""}${input.timeUsedMinutes ? `; time used ${input.timeUsedMinutes} min` : ""}
Essay length: ${input.wordCount} words
${input.rubricText.trim() ? `Rubric / marking scheme supplied by the student (teacher-specific unless stated otherwise):\n${escapeBlock(input.rubricText)}` : "No rubric supplied."}
${missing.length ? `Missing information: ${missing.join(" ")}` : ""}
</current_task>

<source_text>
${input.sourceText.trim() ? escapeBlock(input.sourceText) : "(none provided)"}
</source_text>

<essay>
${escapeBlock(input.essayText)}
</essay>`;
  return { system: ASSESSMENT_SYSTEM, user };
}

export function validateAssessment(out: AssessmentOutput, input: { taskType: TaskTypeKey; essayText: string; sourceText: string; taskPrompt: string }): string[] {
  const problems: string[] = [];
  const expected = new Set<string>(taskTypeDimensions(input.taskType));
  const seen = new Set<string>();
  for (const d of out.dimensions) {
    if (!expected.has(d.key)) problems.push(`dimension "${d.key}" is not assessed for task type ${input.taskType}; remove it.`);
    if (seen.has(d.key)) problems.push(`dimension "${d.key}" appears twice.`);
    seen.add(d.key);
    if (!(d.low <= d.best && d.best <= d.high)) problems.push(`dimension "${d.key}": need low ≤ best ≤ high.`);
    for (const e of d.evidence) if (!containsQuote(input.essayText, e.quote)) problems.push(`dimension "${d.key}" evidence quote not found verbatim in the essay: "${e.quote.slice(0, 80)}"`);
  }
  for (const k of expected) if (!seen.has(k)) problems.push(`missing dimension "${k}".`);
  if (out.strengths.length === 0) problems.push("at least one strength with a quote is required.");
  for (const s of out.strengths) if (!containsQuote(input.essayText, s.quote)) problems.push(`strength quote not found verbatim in the essay: "${s.quote.slice(0, 80)}"`);
  for (const w of out.weaknesses) {
    if (!w.quotes.length) problems.push(`weakness "${w.title}" needs at least one quote.`);
    for (const q of w.quotes) if (!containsQuote(input.essayText, q)) problems.push(`weakness "${w.title}" quote not found verbatim in the essay: "${q.slice(0, 80)}"`);
  }
  if (out.holistic_check.low > out.holistic_check.high) problems.push("holistic_check low must be ≤ high.");
  if (out.action_plan.length === 0) problems.push("action_plan must contain at least one action.");
  for (const a of out.action_plan) if (!(SKILL_KEYS as readonly string[]).includes(a.skill_key)) problems.push(`unknown skill_key ${a.skill_key}`);
  const t = TASK_TYPES[input.taskType];
  const missingMaterial = !input.taskPrompt.trim() || (t.needsSourceText && !input.sourceText.trim());
  if (missingMaterial && out.confidence !== "low") problems.push('confidence must be "low" because the task prompt or required source text is missing.');
  if (missingMaterial && out.uncertainty_notes.length === 0) problems.push("uncertainty_notes must explain the missing material.");
  return problems;
}
