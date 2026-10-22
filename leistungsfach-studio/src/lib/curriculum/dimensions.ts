// Runtime mirror of SKILL.md §4. Keys must match the skill (checked by curriculum-consistency test).

export const DIMENSION_GROUPS = ["content", "language"] as const;
export type DimensionGroup = (typeof DIMENSION_GROUPS)[number];

export const DIMENSION_KEYS = [
  "task_fulfilment",
  "comprehension",
  "analytical_depth",
  "interpretation",
  "evidence_use",
  "argumentation",
  "structure_cohesion",
  "selection_condensing",
  "addressee_purpose",
  "source_consistency",
  "grammar_accuracy",
  "vocabulary_precision",
  "idiomaticity",
  "syntax_style",
  "register_conventions",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

export type Dimension = {
  key: DimensionKey;
  group: DimensionGroup;
  label: string;
  looksFor: string;
};

export const DIMENSIONS: Record<DimensionKey, Dimension> = {
  task_fulfilment: { key: "task_fulfilment", group: "content", label: "Task fulfilment & operator", looksFor: "Does exactly what the operator asks; focus; scope; length" },
  comprehension: { key: "comprehension", group: "content", label: "Understanding of the material", looksFor: "Accurate grasp of explicit and implicit meaning" },
  analytical_depth: { key: "analytical_depth", group: "content", label: "Analytical depth", looksFor: "Function, effect, significance, link to purpose — not device-naming for its own sake" },
  interpretation: { key: "interpretation", group: "content", label: "Interpretation", looksFor: "Plausible, nuanced, evidence-based readings; awareness of ambiguity" },
  evidence_use: { key: "evidence_use", group: "content", label: "Evidence", looksFor: "Relevant, well-chosen, smoothly integrated quotations/references with line numbers; evidence explained" },
  argumentation: { key: "argumentation", group: "content", label: "Argumentation", looksFor: "Clear position, development, examples, counter-position plus rebuttal, weighing" },
  structure_cohesion: { key: "structure_cohesion", group: "content", label: "Structure & cohesion", looksFor: "Logical organisation, paragraphing, purposeful introduction and conclusion, transitions" },
  selection_condensing: { key: "selection_condensing", group: "content", label: "Selection & condensing", looksFor: "Relevant information selected and condensed" },
  addressee_purpose: { key: "addressee_purpose", group: "content", label: "Addressee, purpose & text type", looksFor: "Fit to audience, situation and text-type conventions" },
  source_consistency: { key: "source_consistency", group: "content", label: "Consistency with the source", looksFor: "Creative writing true to characters, facts, perspective" },
  grammar_accuracy: { key: "grammar_accuracy", group: "language", label: "Grammar & accuracy", looksFor: "Frequency and impact of errors; slips count less than systematic errors" },
  vocabulary_precision: { key: "vocabulary_precision", group: "language", label: "Vocabulary range & precision", looksFor: "Precise, task-appropriate words; analytical metalanguage" },
  idiomaticity: { key: "idiomaticity", group: "language", label: "Idiomaticity & collocations", looksFor: "Natural collocations; no German interference" },
  syntax_style: { key: "syntax_style", group: "language", label: "Sentence variety & stylistic control", looksFor: "Controlled complex syntax and variety, clarity first" },
  register_conventions: { key: "register_conventions", group: "language", label: "Register & genre language", looksFor: "Formality, tense conventions, genre-specific language" },
};
