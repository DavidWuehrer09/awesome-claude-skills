import type { ProgressReviewOutput, TeacherAnalysisOutput, VocabUseOutput } from "@/lib/ai/schemas";
import { containsQuote } from "@/lib/text/normalize";
import { escapeBlock, SHARED_RULES, TEACHING_PRINCIPLES } from "./shared";

export const PROGRESS_PROMPT_VERSION = "progress-review-1.0";
export const VOCAB_PROMPT_VERSION = "vocab-check-1.0";
export const TEACHER_PROMPT_VERSION = "teacher-analysis-1.0";

// ---------- Progress review ----------
export const PROGRESS_SYSTEM = `${SHARED_RULES}

${TEACHING_PRINCIPLES}

<progress_rules>
You write a short progress review from COMPUTED STATISTICS ONLY (you do not see essays).
- Use only numbers that appear in the statistics; never compute new averages or invent figures.
- Every improvement or concern must cite its evidence (which statistic).
- comparability_cautions: explain when score changes may reflect different task types, modes, missing material, or small samples rather than real change in ability. Include the caveats provided.
- With very little data, say plainly that it is too early to judge trends.
- next_steps: exactly 3, concrete and tied to the statistics.
</progress_rules>`;

export function buildProgressPrompt(stats: unknown, caveats: string[]) {
  return {
    system: PROGRESS_SYSTEM,
    user: `<statistics>\n${JSON.stringify(stats, null, 1)}\n</statistics>\n<computed_caveats>\n${caveats.map((c) => `- ${c}`).join("\n") || "(none)"}\n</computed_caveats>`,
  };
}

function numbersIn(s: string): string[] {
  return (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/** Any number in the review text must appear in the statistics (prevents fabricated figures). */
export function validateProgressReview(out: ProgressReviewOutput, stats: unknown): string[] {
  const allowed = new Set(numbersIn(JSON.stringify(stats)).flatMap((n) => [n, String(Number(n)), String(Math.round(Number(n)))]));
  ["1", "2", "3", "15", "0"].forEach((n) => allowed.add(n));
  const text = [out.summary, ...out.improvements.flatMap((i) => [i.statement, i.evidence]), ...out.concerns.flatMap((i) => [i.statement, i.evidence]), ...out.comparability_cautions, ...out.next_steps].join(" ");
  const bad = numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
  const p: string[] = [];
  if (bad.length) p.push(`these numbers do not appear in the statistics: ${[...new Set(bad)].slice(0, 8).join(", ")} — remove or replace them with figures from the statistics.`);
  if (out.next_steps.length !== 3) p.push("next_steps must contain exactly 3 items.");
  return p;
}

// ---------- Vocabulary use ----------
export const VOCAB_SYSTEM = `${SHARED_RULES}

<vocab_rules>
The student practises a target expression by writing an ORIGINAL sentence. Judge:
- used_target: is the target expression (or a correct inflected form) actually used?
- natural: would a skilled writer use it this way (collocation, register, meaning)?
- outcome: correct (used, natural, grammatical), partial (used but with a flaw), incorrect.
- feedback: 1–3 sentences, specific. corrected_sentence: a natural version keeping the student's idea, or null if already correct.
Do not penalise correct, natural sentences for being simple.
</vocab_rules>`;

export function buildVocabPrompt(input: { term: string; meaning: string; collocations: string[]; register: string; sentence: string }) {
  return {
    system: VOCAB_SYSTEM,
    user: `<target term="${escapeBlock(input.term)}" register="${input.register}">Meaning: ${escapeBlock(input.meaning)}. Typical collocations: ${input.collocations.map(escapeBlock).join(", ") || "-"}</target>\n<student_sentence>${escapeBlock(input.sentence)}</student_sentence>`,
  };
}

export function validateVocab(out: VocabUseOutput): string[] {
  if (out.outcome === "correct" && (!out.used_target || !out.natural)) return ["outcome 'correct' requires used_target and natural to be true."];
  return [];
}

// ---------- Teacher feedback analysis ----------
export const TEACHER_SYSTEM = `${SHARED_RULES}

<teacher_analysis_rules>
The student entered feedback and/or marking criteria from THEIR teacher. Extract the teacher's expectations as specific, reusable observations.
- Each observation must be supported by a verbatim quote from the teacher's comments or criteria.
- These are teacher-specific preferences, never official Bavarian rules — do not generalise them as such.
- Do not infer preferences that the text does not state.
- criteria_summary: 1–3 sentences summarising what the teacher's criteria emphasise (or "No criteria given").
- notes: anything ambiguous the student could clarify with the teacher.
</teacher_analysis_rules>`;

export function buildTeacherPrompt(input: { comments: string; criteria: string; teacherScore: number | null; taskType: string | null }) {
  return {
    system: TEACHER_SYSTEM,
    user: `<teacher_feedback task_type="${input.taskType ?? "unknown"}" score="${input.teacherScore ?? "not given"}">
Comments:
${escapeBlock(input.comments || "(none)")}
Criteria / marking scheme:
${escapeBlock(input.criteria || "(none)")}
</teacher_feedback>`,
  };
}

export function validateTeacher(out: TeacherAnalysisOutput, input: { comments: string; criteria: string }): string[] {
  const hay = `${input.comments}\n${input.criteria}`;
  return out.observations.filter((o) => !containsQuote(hay, o.quote)).map((o) => `observation quote not found in teacher text: "${o.quote.slice(0, 80)}"`);
}
