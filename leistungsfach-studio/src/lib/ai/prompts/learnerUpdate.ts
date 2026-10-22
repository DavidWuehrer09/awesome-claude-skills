import type { LearnerUpdateOutput } from "@/lib/ai/schemas";
import { containsQuote } from "@/lib/text/normalize";
import { escapeBlock, renderSkillCatalogue, SHARED_RULES } from "./shared";

export const LEARNER_UPDATE_PROMPT_VERSION = "learner-update-1.0";

export const LEARNER_UPDATE_SYSTEM = `${SHARED_RULES}

${renderSkillCatalogue()}

<learner_update_rules>
You update the learner model from ONE piece of the student's own writing and its validated assessment.
- observations: 4–12 skill observations. Each needs a verbatim quote from the student's text, a short note, polarity (strength/weakness/neutral), and level_estimate on 0–15 for that skill as shown in THIS text (null if the text gives too little evidence for that skill). Only include skills this text actually provides evidence for.
- error_patterns: recurring-type problems (grammar, collocation, vocabulary, register, structure, analysis, argument, evidence). Use a general, reusable label ("discuss + about", "device named without effect", "missing line references"), not a one-off description. If the problem matches one of the KNOWN PATTERNS listed, set existing_pattern_id to its id; otherwise null. example_quote must be verbatim from the student's text; give the correction and a one-sentence explanation.
- checked_absent_pattern_ids: ids of KNOWN PATTERNS you specifically checked and that do NOT occur in this text (only when the text gave a real opportunity to make the error).
- Do not invent weaknesses to fill the list. One slip is still reported (the app tracks whether it recurs), but do not over-generalise from it.
</learner_update_rules>`;

export type KnownPattern = { id: string; label: string; category: string; status: string };

export function buildLearnerUpdatePrompt(input: { studentText: string; assessmentSummary: string; knownPatterns: KnownPattern[]; kind: "essay" | "exercise" }) {
  return {
    system: LEARNER_UPDATE_SYSTEM,
    user: `<known_patterns>
${input.knownPatterns.length ? input.knownPatterns.map((p) => `- id=${p.id} [${p.category}, ${p.status}] ${p.label}`).join("\n") : "(none yet)"}
</known_patterns>
<assessment_summary>
${escapeBlock(input.assessmentSummary)}
</assessment_summary>
<student_text kind="${input.kind}">
${escapeBlock(input.studentText)}
</student_text>`,
  };
}

export function validateLearnerUpdate(out: LearnerUpdateOutput, input: { studentText: string; knownPatternIds: string[] }): string[] {
  const p: string[] = [];
  const ids = new Set(input.knownPatternIds);
  for (const o of out.observations) if (!containsQuote(input.studentText, o.quote)) p.push(`observation (${o.skill_key}) quote not found verbatim: "${o.quote.slice(0, 80)}"`);
  for (const e of out.error_patterns) {
    if (e.existing_pattern_id && !ids.has(e.existing_pattern_id)) p.push(`unknown existing_pattern_id "${e.existing_pattern_id}"`);
    if (!containsQuote(input.studentText, e.example_quote)) p.push(`error pattern "${e.label}" example_quote not found verbatim: "${e.example_quote.slice(0, 80)}"`);
  }
  for (const id of out.checked_absent_pattern_ids) if (!ids.has(id)) p.push(`unknown checked_absent id "${id}"`);
  const reported = new Set(out.error_patterns.map((e) => e.existing_pattern_id).filter(Boolean));
  for (const id of out.checked_absent_pattern_ids) if (reported.has(id)) p.push(`pattern ${id} cannot be both present and absent.`);
  return p;
}
