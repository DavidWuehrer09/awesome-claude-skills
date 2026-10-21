/**
 * Task-specific PRACTICE rubrics. These are not official Bavarian rubrics; the
 * UI labels them as practice rubrics wherever they are shown.
 */
export type TaskType =
  | "comment" | "discussion" | "non_fiction_analysis" | "literary_analysis" | "characterisation" | "stylistic_analysis"
  | "mediation" | "comparison" | "creative" | "summary" | "paragraph" | "sentence" | "free";

export const TASK_TYPES: { id: TaskType; label: string; abitur: boolean }[] = [
  { id: "comment", label: "Comment / argumentative essay", abitur: true },
  { id: "discussion", label: "Discussion of a controversial issue", abitur: true },
  { id: "non_fiction_analysis", label: "Analysis of a non-fictional text", abitur: true },
  { id: "stylistic_analysis", label: "Analysis of language and rhetorical devices", abitur: true },
  { id: "literary_analysis", label: "Literary analysis", abitur: true },
  { id: "characterisation", label: "Characterisation", abitur: true },
  { id: "mediation", label: "Mediation (German → English)", abitur: true },
  { id: "comparison", label: "Comparative analysis", abitur: true },
  { id: "creative", label: "Creative / transformative writing", abitur: true },
  { id: "summary", label: "Summary", abitur: true },
  { id: "paragraph", label: "Paragraph", abitur: false },
  { id: "sentence", label: "Sentence work", abitur: false },
  { id: "free", label: "Free writing", abitur: false },
];

export const DIMENSION_LABEL: Record<string, string> = {
  task_fulfilment: "Task fulfilment",
  argument: "Argument quality and depth",
  structure: "Structure and coherence",
  analysis: "Analytical precision",
  grammar: "Grammar and syntax",
  vocabulary: "Vocabulary range and precision",
  idiomaticity: "Idiomaticity and collocations",
  register: "Register and style",
  evidence: "Evidence and examples",
  mechanics: "Spelling and punctuation",
};

const NOTES: Record<TaskType, string> = {
  comment: "Comment: clear position; at least two developed arguments with examples; a genuine counterargument that is conceded or refuted; logical progression; conclusion that follows from the argument. 'analysis' is usually not_applicable.",
  discussion: "Discussion: balanced weighing of both sides, criteria for judgement, a reasoned conclusion. 'analysis' usually not_applicable.",
  non_fiction_analysis: "Analysis of a non-fictional text: thesis about how the text works; technique → quoted evidence with line reference → effect → link to intention/audience; structure of the text; no personal opinion on the issue. 'argument' means quality of the analytical argument.",
  stylistic_analysis: "Language analysis: identify devices precisely AND explain their effect in context; naming devices without effect earns little.",
  literary_analysis: "Literary analysis: interpretation supported by quotations; narrative perspective, characterisation, imagery, atmosphere; several readings may be valid.",
  characterisation: "Characterisation: traits with direct/indirect evidence, development, relationships; avoid retelling the plot.",
  mediation: "Mediation: addressee and purpose; selection of relevant information only; adaptation to the text type and audience (not literal translation); explanations of culture-specific items. 'analysis' not_applicable.",
  comparison: "Comparison: clear criteria; point-by-point comparison of similarities and differences; a conclusion that weighs them.",
  creative: "Creative writing: task-appropriate text type, consistency with the source, voice and style, purposeful language.",
  summary: "Summary: main points only, own words, simple present, neutral, no quotations or opinion.",
  paragraph: "Paragraph: topic sentence with a clear claim; development with explanation, evidence or example; analysis or qualification; a concluding link.",
  sentence: "Sentence work: correctness, precision, naturalness and register of a single sentence.",
  free: "General academic writing quality.",
};

export function rubricNote(taskType: string): string {
  return NOTES[(taskType as TaskType)] ?? NOTES.free;
}

/**
 * Normalise free-text error categories into a stable curriculum set. "drill" is
 * the closest My English Examiner skill, for targeted drills (/abitur/examiner/drills?skill=…).
 */
export const CURRICULUM: Record<string, { label: string; practice: string; drill: string }> = {
  articles: { label: "Articles", practice: "Focused article exercises: zero vs. definite article with abstract and plural nouns.", drill: "grammar_errors" },
  verb_patterns: { label: "Verb patterns", practice: "Verb + -ing / to-infinitive / that-clause patterns in context.", drill: "grammar_errors" },
  prepositions: { label: "Prepositions", practice: "Contextual preposition gaps with dependent prepositions (e.g. 'responsible for', 'in contrast to').", drill: "grammar_errors" },
  tenses: { label: "Tenses and aspect", practice: "Tense consistency in analysis (present) vs. narrative reference.", drill: "grammar_errors" },
  agreement: { label: "Agreement", practice: "Subject-verb agreement with long subjects and collective nouns.", drill: "grammar_errors" },
  collocations: { label: "Collocations", practice: "Collocation trainer for your current topic.", drill: "awkward_collocations" },
  word_choice: { label: "Word choice and precision", practice: "Replace vague verbs (show, make, do) with precise ones.", drill: "imprecise_vocabulary" },
  register: { label: "Register", practice: "Rewrite informal sentences in a formal register.", drill: "register_slips" },
  sentence_structure: { label: "Sentence structure", practice: "Sentence combination and variation tasks.", drill: "excessive_complexity" },
  concision: { label: "Concision", practice: "Editing challenges: cut 30% without losing content.", drill: "excessive_complexity" },
  argumentation: { label: "Argumentation", practice: "Claim → reason → evidence → counterargument exercises.", drill: "underdeveloped_counterarguments" },
  analysis: { label: "Analysis", practice: "Evidence-to-interpretation: technique → quote → effect → intention.", drill: "insufficient_textual_evidence" },
  cohesion: { label: "Cohesion and transitions", practice: "Linking paragraphs with precise connectors.", drill: "weak_transitions" },
  spelling: { label: "Spelling", practice: "Typed recall of words you misspell.", drill: "spelling_punctuation" },
  punctuation: { label: "Punctuation", practice: "Commas with relative clauses and introductory phrases.", drill: "spelling_punctuation" },
};

/** Targeted drills for a writing error category (closest examiner skill). */
export function drillHref(category: string): string {
  return `/abitur/examiner/drills?skill=${CURRICULUM[category]?.drill ?? "grammar_errors"}`;
}

export function normalizeCategory(raw: string): string {
  const s = raw.toLowerCase();
  if (/article|determiner/.test(s)) return "articles";
  if (/verb pattern|gerund|infinitive|complement/.test(s)) return "verb_patterns";
  if (/preposition/.test(s)) return "prepositions";
  if (/tense|aspect/.test(s)) return "tenses";
  if (/agreement|concord/.test(s)) return "agreement";
  if (/colloc/.test(s)) return "collocations";
  if (/register|formal|informal/.test(s)) return "register";
  if (/concis|wordy|redundan/.test(s)) return "concision";
  if (/sentence|syntax|structure/.test(s) && !/paragraph/.test(s)) return "sentence_structure";
  if (/argument|counter|claim/.test(s)) return "argumentation";
  if (/analys|evidence|interpret/.test(s)) return "analysis";
  if (/cohes|transition|connector|structure/.test(s)) return "cohesion";
  if (/spell/.test(s)) return "spelling";
  if (/punct|comma/.test(s)) return "punctuation";
  if (/vocab|word choice|precision|clarity|vague/.test(s)) return "word_choice";
  if (/grammar/.test(s)) return "agreement";
  return "word_choice";
}

/** Spaced revisiting of writing weaknesses, analogous to vocabulary review. */
export function nextRevisit(pattern: { intervalDays: number }, presentNow: boolean, now: Date) {
  const intervalDays = presentNow ? 1 : Math.min(60, Math.max(2, pattern.intervalDays * 2));
  return { intervalDays, nextRevisit: new Date(now.getTime() + intervalDays * 86400000) };
}
