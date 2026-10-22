// Runtime mirror of SKILL.md §3 (task types, operators) and §4 (weights).
import type { DimensionKey } from "./dimensions";
import type { Provenance } from "./sources";

export const TASK_TYPE_KEYS = [
  "comprehension",
  "summary",
  "nonfiction_analysis",
  "literary_analysis",
  "characterisation",
  "comparative_analysis",
  "comment",
  "creative_writing",
  "speech",
  "mediation",
] as const;
export type TaskTypeKey = (typeof TASK_TYPE_KEYS)[number];

export type OperatorGuide = {
  operator: string;
  demands: string;
  pitfall: string;
  provenance: Provenance;
};

export type TaskType = {
  key: TaskTypeKey;
  label: string;
  abiturPlace: string;
  operators: string[];
  guide: OperatorGuide;
  /** Weight per applicable dimension. Dimensions not listed are not assessed for this task type. */
  weights: Partial<Record<DimensionKey, number>>;
  needsSourceText: boolean;
  expectations: string[];
};

const ANALYSIS_LANGUAGE = { grammar_accuracy: 3, vocabulary_precision: 3, idiomaticity: 2, syntax_style: 2, register_conventions: 1 } as const;
const PRODUCTIVE_LANGUAGE = { grammar_accuracy: 3, vocabulary_precision: 3, idiomaticity: 2, syntax_style: 2, register_conventions: 2 } as const;
const REPRODUCTIVE_LANGUAGE = { grammar_accuracy: 3, vocabulary_precision: 2, idiomaticity: 2, syntax_style: 1, register_conventions: 2 } as const;

export const TASK_TYPES: Record<TaskTypeKey, TaskType> = {
  comprehension: {
    key: "comprehension", label: "Text comprehension (outline / describe / point out)", abiturPlace: "Writing, sub-task 1",
    operators: ["outline", "describe", "point out", "state"],
    guide: { operator: "outline / describe / point out", demands: "Only the selected aspects, neutral, in your own words, no interpretation.", pitfall: "Retelling or evaluating.", provenance: "interpretation" },
    weights: { task_fulfilment: 3, comprehension: 4, selection_condensing: 2, structure_cohesion: 1, ...REPRODUCTIVE_LANGUAGE },
    needsSourceText: true,
    expectations: ["Covers exactly the aspects the task names", "Own words; short quotations only if indispensable", "Neutral, simple present"],
  },
  summary: {
    key: "summary", label: "Summary", abiturPlace: "Classwork; part of comprehension",
    operators: ["summarise", "sum up"],
    guide: { operator: "summarise", demands: "Main points, condensed, simple present, own words, no quotations, no opinion, framing introductory sentence.", pitfall: "Detail creep, quoting, chronological retelling.", provenance: "interpretation" },
    weights: { task_fulfilment: 3, comprehension: 3, selection_condensing: 4, structure_cohesion: 1, ...REPRODUCTIVE_LANGUAGE },
    needsSourceText: true,
    expectations: ["Introductory sentence (author, title, text type, topic)", "Main ideas only, logically linked", "No personal comment"],
  },
  nonfiction_analysis: {
    key: "nonfiction_analysis", label: "Non-fictional text analysis (incl. rhetorical analysis)", abiturPlace: "Writing, sub-task 2 (non-literary)",
    operators: ["analyse", "examine", "explain"],
    guide: { operator: "analyse / examine", demands: "Technique → evidence (quote + line) → function in context → effect on the reader → contribution to purpose.", pitfall: "Listing devices (feature-spotting).", provenance: "interpretation" },
    weights: { task_fulfilment: 2, comprehension: 2, analytical_depth: 4, evidence_use: 3, structure_cohesion: 2, ...ANALYSIS_LANGUAGE },
    needsSourceText: true,
    expectations: ["Thesis on the author's purpose and strategy", "Effect chain for each point", "Organised by strategy/function, not by line order", "Evaluates effectiveness at the top band"],
  },
  literary_analysis: {
    key: "literary_analysis", label: "Literary analysis and interpretation", abiturPlace: "Writing, sub-task 2 (literary)",
    operators: ["analyse", "interpret", "examine"],
    guide: { operator: "analyse / interpret", demands: "Reasoned, evidence-based reading of meaning; narrative technique, imagery, structure and their function; ambiguity and alternative readings.", pitfall: "Assertion without support, or plot summary.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, comprehension: 2, analytical_depth: 3, interpretation: 3, evidence_use: 3, structure_cohesion: 2, ...ANALYSIS_LANGUAGE },
    needsSourceText: true,
    expectations: ["Interpretive thesis", "Form linked to meaning", "Considers more than one reading where the text allows it"],
  },
  characterisation: {
    key: "characterisation", label: "Characterisation and narrative perspective", abiturPlace: "Writing, sub-task 2 (literary)",
    operators: ["characterise", "analyse (narrative perspective)"],
    guide: { operator: "characterise", demands: "Inferred (indirect) and stated (direct) traits, each with evidence; development; function in the text; narrative perspective and its effect.", pitfall: "Retelling the plot.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, comprehension: 2, interpretation: 3, analytical_depth: 2, evidence_use: 3, structure_cohesion: 2, ...ANALYSIS_LANGUAGE },
    needsSourceText: true,
    expectations: ["Organised by traits, not chronology", "Distinguishes direct and indirect characterisation", "Links perspective to the reader's view of the character"],
  },
  comparative_analysis: {
    key: "comparative_analysis", label: "Comparative analysis", abiturPlace: "Writing, sub-task 2/3",
    operators: ["compare", "contrast"],
    guide: { operator: "compare / contrast", demands: "Criteria-led, point-by-point similarities and differences, with a conclusion.", pitfall: "Two separate summaries.", provenance: "interpretation" },
    weights: { task_fulfilment: 3, comprehension: 2, analytical_depth: 3, evidence_use: 2, structure_cohesion: 3, ...ANALYSIS_LANGUAGE },
    needsSourceText: true,
    expectations: ["Explicit criteria of comparison", "Integrated, point-by-point structure", "Conclusion weighs the comparison"],
  },
  comment: {
    key: "comment", label: "Comment and discussion", abiturPlace: "Writing, sub-task 3 (Stellungnahme)",
    operators: ["comment", "discuss", "assess", "evaluate"],
    guide: { operator: "comment / discuss / assess", demands: "Clear position; developed arguments with examples; a counter-position acknowledged and answered; weighing; a conclusion that follows from the argument.", pitfall: "Listing points; straw-man counter-argument; conclusion that ignores the argument.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, argumentation: 5, structure_cohesion: 3, evidence_use: 1, ...ANALYSIS_LANGUAGE },
    needsSourceText: false,
    expectations: ["Position stated early", "Each argument: claim → reasoning → example", "Counter-argument plus rebuttal", "Conclusion weighs, does not merely repeat"],
  },
  creative_writing: {
    key: "creative_writing", label: "Creative / re-creative writing", abiturPlace: "Writing, sub-task 3 (gestaltendes Schreiben)",
    operators: ["write (interior monologue, letter, diary entry, continuation, dialogue)"],
    guide: { operator: "write (creative)", demands: "Consistent with the source (characters, facts, perspective, tone); conventions of the required text type; recognisable link to the source's themes.", pitfall: "Contradicting the source; ignoring the text type.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, source_consistency: 4, addressee_purpose: 3, structure_cohesion: 1, ...PRODUCTIVE_LANGUAGE },
    needsSourceText: true,
    expectations: ["Voice fits the character", "Text-type conventions", "Develops the source's themes without contradicting it"],
  },
  speech: {
    key: "speech", label: "Speech and audience-oriented writing", abiturPlace: "Writing, sub-task 3 / classwork",
    operators: ["write a speech / article / letter to the editor / blog post"],
    guide: { operator: "write (speech / article)", demands: "Addressee, purpose, occasion; purposeful rhetorical strategies; register and genre conventions (salutation, framing).", pitfall: "An essay with 'Dear audience' added.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, addressee_purpose: 4, argumentation: 3, structure_cohesion: 2, ...PRODUCTIVE_LANGUAGE },
    needsSourceText: false,
    expectations: ["Addresses the audience directly and consistently", "Rhetorical devices serve the purpose", "Memorable opening and close"],
  },
  mediation: {
    key: "mediation", label: "Mediation (Sprachmittlung)", abiturPlace: "Part C",
    operators: ["write (an email, article, …) for a named addressee based on German material"],
    guide: { operator: "mediate", demands: "Purpose- and addressee-oriented transfer of selected relevant content, adapted (cultural explanation where needed), never a literal translation; required text type.", pitfall: "Translating everything; including irrelevant details.", provenance: "interpretation" },
    weights: { task_fulfilment: 2, selection_condensing: 4, addressee_purpose: 4, comprehension: 1, ...REPRODUCTIVE_LANGUAGE, vocabulary_precision: 3 },
    needsSourceText: true,
    expectations: ["Only information relevant to the addressee's need", "Explains culture-specific terms", "Correct text type and register"],
  },
};

export function taskTypeDimensions(key: TaskTypeKey): DimensionKey[] {
  return Object.keys(TASK_TYPES[key].weights) as DimensionKey[];
}
