import type { ExerciseEvaluationOutput, ExerciseOutput, ExerciseType, Difficulty } from "@/lib/ai/schemas";
import { SKILLS, type SkillKey } from "@/lib/learner/skills";
import { containsQuote } from "@/lib/text/normalize";
import { ANALYSIS_EXPECTATIONS, escapeBlock, renderSkillCatalogue, SHARED_RULES, TEACHING_PRINCIPLES } from "./shared";

export const EXERCISE_GENERATION_PROMPT_VERSION = "exercise-generation-1.0";
export const EXERCISE_EVALUATION_PROMPT_VERSION = "exercise-evaluation-1.0";

const TYPE_GUIDE: Record<ExerciseType, string> = {
  diagnostic: "3–5 short questions that reveal how well the student commands the skill (mix recognition and production).",
  sentence_improvement: "3–5 sentences to improve — use the student's own weak sentences (given below) or close variants; the student rewrites each.",
  device_analysis: "A short original passage (80–150 words) with 2–3 quotations; for each, the student writes the full effect chain.",
  evidence_interpretation: "A claim about a short original passage; the student selects, integrates and explains evidence.",
  paragraph_reconstruction: "A weak or scrambled paragraph; the student rebuilds it with a clear topic sentence and cohesion.",
  collocation: "4–6 items built from the student's real collocation errors: choose/complete, then one original sentence per target.",
  grammar: "4–6 items targeting the student's actual error pattern in new contexts, plus one original sentence; ask for a one-line rule.",
  timed_task: "A short exam-style writing task (one paragraph, 120–200 words) to be done within the time limit; set clear success criteria.",
  transfer: "Apply the skill to a NEW text or topic the student has not written about; this tests independent application.",
};

export const EXERCISE_GENERATION_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

${ANALYSIS_EXPECTATIONS}

${renderSkillCatalogue()}

<exercise_rules>
Design ONE focused exercise for one skill.
- objective: one sentence naming the skill and what the student will be able to do.
- instructions: clear, short, second person.
- passage: if needed, an ORIGINAL practice text written for this exercise (never attributed to a real author, newspaper or publication; you may set it in a realistic context). Begin it with "[Practice text written for this exercise]". null if not needed.
- items: numbered tasks with ids "1", "2", …
- success_criteria: 2–4 observable criteria.
- model_answer and answer_key: complete, natural, at the stated difficulty. These stay hidden until the student has answered.
- Difficulty: foundation (scaffolded), core (Abitur-relevant standard), stretch (demanding), exam (exam conditions).
- Prefer the student's real errors and topics given in the context. Avoid showy vocabulary.
</exercise_rules>`;

export function buildExerciseGenerationPrompt(input: {
  skill: SkillKey; type: ExerciseType; difficulty: Difficulty; isTransfer: boolean; timeLimitMinutes: number | null;
  reason: string; patternLabel: string | null; patternExamples: string[]; studentSentences: string[]; topicHint: string;
}) {
  const s = SKILLS[input.skill];
  return {
    system: EXERCISE_GENERATION_SYSTEM,
    user: `<target skill="${s.key}">${s.label}: ${s.description}</target>
<exercise_type name="${input.type}">${TYPE_GUIDE[input.type]}</exercise_type>
<difficulty>${input.difficulty}</difficulty>
${input.isTransfer ? "<transfer>Use a new topic/text unrelated to the student's previous essays.</transfer>" : ""}
${input.timeLimitMinutes ? `<time_limit_minutes>${input.timeLimitMinutes}</time_limit_minutes>` : ""}
<why_this_exercise>${escapeBlock(input.reason)}</why_this_exercise>
<error_pattern>${input.patternLabel ? escapeBlock(input.patternLabel) : "(none)"}
${input.patternExamples.map((e) => `- ${escapeBlock(e)}`).join("\n")}</error_pattern>
<student_sentences>
${input.studentSentences.length ? input.studentSentences.map((e) => `- ${escapeBlock(e)}`).join("\n") : "(none available)"}
</student_sentences>
<topic_hint>${escapeBlock(input.topicHint || "any topic relevant to upper-secondary English (society, media, politics, literature)")}</topic_hint>`,
  };
}

export function validateExercise(out: ExerciseOutput): string[] {
  const p: string[] = [];
  if (!out.items.length) p.push("items must not be empty.");
  const ids = new Set(out.items.map((i) => i.id));
  if (ids.size !== out.items.length) p.push("item ids must be unique.");
  for (const k of out.answer_key) if (!ids.has(k.item_id)) p.push(`answer_key refers to unknown item ${k.item_id}.`);
  if (out.passage && !out.passage.startsWith("[Practice text")) p.push('passage must begin with "[Practice text written for this exercise]".');
  if (!out.success_criteria.length) p.push("success_criteria must not be empty.");
  return p;
}

export const EXERCISE_EVALUATION_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

${ANALYSIS_EXPECTATIONS}

${renderSkillCatalogue()}

<evaluation_rules>
Evaluate the student's answer to one exercise against its success criteria and answer key. The answer key is a guide, not the only acceptable answer: credit correct alternatives.
- outcome: correct (all criteria met), partial, incorrect. score 0–1.
- item_feedback: one entry per item answered, specific to what the student wrote.
- strengths / improvements: concrete, quoting the student's answer where helpful.
- corrected_version: an improved version of the student's answer that keeps their ideas (null if already correct).
- follow_up: the single most useful next step.
- observations: 1–4 skill observations with verbatim quotes FROM THE STUDENT'S ANSWER and level_estimate (0–15) where the answer gives enough evidence; otherwise null.
If the answer is empty, off-task or copied from the model answer text, say so and mark incorrect.
</evaluation_rules>`;

export function buildExerciseEvaluationPrompt(input: { exercise: ExerciseOutput; skill: SkillKey; difficulty: string; answer: string; timeLimitMinutes: number | null; timeUsedSeconds: number | null }) {
  const e = input.exercise;
  return {
    system: EXERCISE_EVALUATION_SYSTEM,
    user: `<exercise skill="${input.skill}" difficulty="${input.difficulty}">
Title: ${escapeBlock(e.title)}
Objective: ${escapeBlock(e.objective)}
Instructions: ${escapeBlock(e.instructions)}
${e.passage ? `Passage:\n${escapeBlock(e.passage)}` : ""}
Items:
${e.items.map((i) => `${i.id}. ${escapeBlock(i.prompt)}`).join("\n")}
Success criteria: ${e.success_criteria.map(escapeBlock).join("; ")}
Answer key:
${e.answer_key.map((k) => `${k.item_id}: ${escapeBlock(k.answer)} (${escapeBlock(k.explanation)})`).join("\n")}
Model answer: ${escapeBlock(e.model_answer)}
${input.timeLimitMinutes ? `Time limit: ${input.timeLimitMinutes} min; time used: ${input.timeUsedSeconds ? Math.round(input.timeUsedSeconds / 60) : "unknown"} min` : ""}
</exercise>
<student_answer>
${escapeBlock(input.answer)}
</student_answer>`,
  };
}

export function validateExerciseEvaluation(out: ExerciseEvaluationOutput, input: { answer: string; itemIds: string[] }): string[] {
  const p: string[] = [];
  const ids = new Set(input.itemIds);
  for (const f of out.item_feedback) if (!ids.has(f.item_id)) p.push(`item_feedback refers to unknown item ${f.item_id}.`);
  for (const o of out.observations) if (!containsQuote(input.answer, o.quote)) p.push(`observation quote not found in the student's answer: "${o.quote.slice(0, 80)}"`);
  const expectedOutcome = out.score >= 0.85 ? "correct" : out.score >= 0.4 ? "partial" : "incorrect";
  if (expectedOutcome !== out.outcome && Math.abs(out.score - 0.5) < 0.45) {
    // allow small inconsistency near boundaries only
    if ((out.outcome === "correct" && out.score < 0.7) || (out.outcome === "incorrect" && out.score > 0.5)) p.push("outcome and score are inconsistent.");
  }
  return p;
}
