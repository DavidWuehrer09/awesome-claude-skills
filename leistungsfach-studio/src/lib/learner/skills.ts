import type { DimensionKey } from "@/lib/curriculum/dimensions";

export const SKILL_KEYS = [
  "analytical_depth",
  "purpose_effect",
  "evidence_integration",
  "argument_development",
  "paragraph_structure",
  "intro_conclusion",
  "cohesion_transitions",
  "vocabulary_precision",
  "idiomatic_collocations",
  "grammar_variety",
  "register_conventions",
  "time_management",
  "operator_fulfilment",
  "comprehension_accuracy",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export type SkillInfo = { key: SkillKey; label: string; description: string; dimensions: DimensionKey[]; group: "content" | "language" | "exam" };

export const SKILLS: Record<SkillKey, SkillInfo> = {
  analytical_depth: { key: "analytical_depth", label: "Analytical depth", description: "Explaining function, effect and significance rather than naming features.", dimensions: ["analytical_depth", "interpretation"], group: "content" },
  purpose_effect: { key: "purpose_effect", label: "Authorial purpose & effect", description: "Linking techniques to the author's intention and the effect on the intended reader.", dimensions: ["analytical_depth", "interpretation", "comprehension"], group: "content" },
  evidence_integration: { key: "evidence_integration", label: "Evidence selection & integration", description: "Choosing apt quotations, integrating them smoothly with line references, and explaining them.", dimensions: ["evidence_use"], group: "content" },
  argument_development: { key: "argument_development", label: "Argument development", description: "Claim → reasoning → example; counter-argument and rebuttal; weighing.", dimensions: ["argumentation"], group: "content" },
  paragraph_structure: { key: "paragraph_structure", label: "Paragraph structure", description: "Topic sentences, internal logic, one idea per paragraph.", dimensions: ["structure_cohesion"], group: "content" },
  intro_conclusion: { key: "intro_conclusion", label: "Introductions & conclusions", description: "Purposeful openings with a thesis; conclusions that weigh rather than repeat.", dimensions: ["structure_cohesion", "task_fulfilment"], group: "content" },
  cohesion_transitions: { key: "cohesion_transitions", label: "Transitions & cohesion", description: "Logical connectors and referencing that make the line of thought easy to follow.", dimensions: ["structure_cohesion", "syntax_style"], group: "content" },
  vocabulary_precision: { key: "vocabulary_precision", label: "Vocabulary range & precision", description: "Precise, task-appropriate words and analytical metalanguage.", dimensions: ["vocabulary_precision"], group: "language" },
  idiomatic_collocations: { key: "idiomatic_collocations", label: "Idiomatic expression & collocations", description: "Natural word combinations; avoiding German interference.", dimensions: ["idiomaticity"], group: "language" },
  grammar_variety: { key: "grammar_variety", label: "Grammar & sentence variety", description: "Accurate grammar and controlled variety of sentence structures.", dimensions: ["grammar_accuracy", "syntax_style"], group: "language" },
  register_conventions: { key: "register_conventions", label: "Register & task conventions", description: "Formality, tense and text-type conventions (e.g. simple present in summaries).", dimensions: ["register_conventions", "addressee_purpose"], group: "language" },
  time_management: { key: "time_management", label: "Exam time management", description: "Completing timed tasks fully within the time allowed.", dimensions: [], group: "exam" },
  operator_fulfilment: { key: "operator_fulfilment", label: "Operator & task fulfilment", description: "Doing exactly what the operator asks — no more, no less.", dimensions: ["task_fulfilment", "selection_condensing", "source_consistency"], group: "content" },
  comprehension_accuracy: { key: "comprehension_accuracy", label: "Text comprehension", description: "Accurate understanding of explicit and implicit meaning in the material.", dimensions: ["comprehension"], group: "content" },
};

export function isSkillKey(k: string): k is SkillKey {
  return (SKILL_KEYS as readonly string[]).includes(k);
}
