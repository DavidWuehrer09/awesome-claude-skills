/**
 * Shared model for My English Examiner: document types, provenance labels and
 * the exam / assessment formats. The zod schemas double as structured-output
 * formats for the AI (all fields required, optional values nullable) and as
 * the stored format; range and consistency rules live in checks.ts.
 */
import { z } from "zod";

export const DOC_TYPES = [
  "exam_paper", "source_text", "task_instruction", "model_answer", "teacher_correction", "rubric", "vocabulary", "student_answer", "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  exam_paper: "Previous exam / Klausur",
  source_text: "Source text",
  task_instruction: "Task instructions",
  model_answer: "Model answer / Erwartungshorizont",
  teacher_correction: "Teacher's correction",
  rubric: "Rubric / grading criteria",
  vocabulary: "Vocabulary list",
  student_answer: "My own answer",
  other: "Other",
};

/** Documents that can prove what the teacher explicitly expects. */
export const TEACHER_DOC_TYPES = new Set<DocType>(["exam_paper", "rubric", "teacher_correction", "task_instruction", "model_answer"]);

export const PROVENANCE = ["teacher_explicit", "observed_pattern", "official_guidance", "general_principle", "ai_suggestion"] as const;
export type Provenance = (typeof PROVENANCE)[number];
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  teacher_explicit: "Teacher's explicit requirement",
  observed_pattern: "Pattern in your materials",
  official_guidance: "Official guidance",
  general_principle: "General principle",
  ai_suggestion: "AI suggestion",
};

export const CONFIDENCE = ["confirmed", "high", "medium", "low", "provisional"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const PROFILE_SECTIONS = [
  "course", "exam_length", "time_limit", "task_types", "task_sequence", "answer_length", "source_genres", "topics", "assessed_skills",
  "grading_criteria", "task_wording", "recurring_feedback", "structure_expectations", "argument_and_evidence", "language_expectations",
  "formatting_conventions", "restrictions", "other",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

const SIGNALS: Record<Exclude<DocType, "other">, [RegExp, number][]> = {
  exam_paper: [
    [/schulaufgabe/i, 1], [/klausur/i, 1], [/\bname\s*:/i, 1], [/\bpoints?\b/i, 1], [/\bBE\b/, 1], [/\btask\s*\d/i, 1],
    [/\b(summari[sz]e|analy[sz]e|comment on|discuss|mediat)/i, 1], [/time\s*(allowed|limit)|arbeitszeit|minutes/i, 1], [/hilfsmittel|dictionary/i, 1],
  ],
  source_text: [
    [/\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/, 1], [/\(adapted\)|abridged|source\s*:/i, 1], [/published|the guardian|new york times|bbc|economist/i, 1], [/\bline\s*\d+|\bl\.\s*\d+/i, 1],
  ],
  task_instruction: [[/^\s*\d[.)]\s*(summari[sz]e|outline|analy[sz]e|examine|comment|discuss|assess)/im, 1], [/\bin about \d+ words\b|\bwords\)/i, 1]],
  model_answer: [[/musterl[öo]sung|model answer|erwartungshorizont|sample answer|lösungsvorschlag/i, 3]],
  teacher_correction: [[/\[\[teacher comment/i, 1], [/\[\[(inserted|deleted)/i, 1], [/\bsp\b|\bgr\b|\bexpr\b|\bwo\b/i, 1], [/korrektur|correction|well done|good point|unclear/i, 1]],
  rubric: [
    [/bewertungs(raster|bogen|kriterien)|rubric|grading (scheme|criteria)|assessment criteria/i, 3],
    [/notenschlüssel|punkteverteilung|gewichtung|inhalt\s*\/\s*sprache|content.*language/i, 1],
  ],
  vocabulary: [[/vokabel|vocabulary|word list|wordbank|glossary/i, 2], [/^\s*\w[\w ]*\s[-–=]\s\w.*\n\s*\w[\w ]*\s[-–=]\s\w/m, 1]],
  student_answer: [[/my answer|mein[e]? (lösung|antwort)|\bI think\b/i, 1]],
};

/** Rule-based first guess. The learner always confirms the type before a document is used as evidence. */
export function classifyMaterial(text: string, filename = ""): { guess: DocType; confidence: "high" | "medium" | "low" } {
  const sample = `${filename}\n${text.slice(0, 20000)}`;
  const ranked = (Object.entries(SIGNALS) as [DocType, [RegExp, number][]][])
    .map(([type, pats]) => [type, pats.reduce((s, [re, w]) => s + (re.test(sample) ? w : 0), 0)] as const)
    .sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  if (bestScore === 0) return { guess: "other", confidence: "low" };
  const margin = bestScore - ranked[1][1];
  return { guess: best, confidence: bestScore >= 3 && margin >= 2 ? "high" : margin >= 1 ? "medium" : "low" };
}

// ---------------------------------------------------------------- exam

export const EXAM_TASK_TYPES = [
  "reading_comprehension", "summary", "non_fiction_analysis", "stylistic_analysis", "intention_tone_audience", "literary_analysis",
  "characterisation", "comparison", "comment", "discussion", "mediation", "text_based_writing", "other",
] as const;

export const DIFFICULTIES = ["consolidation", "realistic", "stretch", "abitur"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

const nstr = z.string().nullable();

export const examSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["fictional_practice", "authentic", "uploaded_material"]),
  label: z.string(),
  materialId: nstr,
  lineNumbered: z.boolean(),
  text: z.string(),
  citation: z.object({
    author: nstr, title: nstr, publication: nstr, date: nstr, url: nstr, adapted: z.boolean(), verified: z.boolean(),
  }).nullable(),
});

export const examTaskSchema = z.object({
  number: z.string(),
  type: z.enum(EXAM_TASK_TYPES),
  operator: z.string(),
  instruction: z.string(),
  sourceIds: z.array(z.string()),
  expectedLength: z.object({ min: z.number().nullable(), max: z.number().nullable(), unit: z.enum(["words", "sentences", "paragraphs"]) }).nullable(),
  suggestedMinutes: z.number().nullable(),
  points: z.number().nullable(),
});

export const examSchema = z.object({
  title: z.string(),
  topic: z.string(),
  examType: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  durationMinutes: z.number(),
  permittedResources: z.array(z.string()),
  generalInstructions: z.string(),
  sources: z.array(examSourceSchema),
  tasks: z.array(examTaskSchema),
  marking: z.object({
    origin: z.enum(["teacher_provided", "official", "ai_practice", "none"]),
    label: z.string(),
    totalPoints: z.number().nullable(),
    sourceMaterialIds: z.array(z.string()),
    criteria: z.array(z.object({ task: z.string(), criterion: z.string(), points: z.number().nullable() })),
  }),
  hidden: z.object({
    taskExpectations: z.array(z.object({
      task: z.string(), expectedContent: z.array(z.string()), acceptableAlternatives: z.array(z.string()), markingNotes: z.string(), commonPitfalls: z.array(z.string()),
    })),
    vocabularyTargets: z.array(z.string()),
    weaknessTargets: z.array(z.string()),
  }),
  provenance: z.object({
    formatBasedOn: z.array(z.string()),
    profileEntriesUsed: z.array(z.string()),
    notes: z.string(),
    assumptions: z.array(z.string()),
  }),
});
export type Exam = z.infer<typeof examSchema>;
export type ExamTask = z.infer<typeof examTaskSchema>;

export const blueprintSchema = z.object({
  topics: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  sourceMaterialIds: z.array(z.string().uuid()).max(5).default([]),
  referenceExamIds: z.array(z.string().uuid()).max(5).default([]),
  followReferenceClosely: z.string().uuid().nullable().default(null),
  examType: z.string().trim().min(2).max(60).default("Klausur"),
  difficulty: z.enum(DIFFICULTIES).default("realistic"),
  mode: z.enum(["practice", "challenging", "mock"]).default("practice"),
  durationMinutes: z.number().int().min(15).max(330).default(90),
  taskCount: z.number().int().min(1).max(5).default(3),
  targetWords: z.number().int().min(50).max(1500).nullable().default(null),
  includeVocabulary: z.boolean().default(true),
  focusWeaknesses: z.boolean().default(true),
  matchTeacherFormat: z.boolean().default(true),
  notes: z.string().trim().max(1000).default(""),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

/** What the learner may see in the exam room. Everything else stays server-side by construction. */
export function studentView(exam: Exam) {
  return {
    title: exam.title,
    topic: exam.topic,
    examType: exam.examType,
    difficulty: exam.difficulty,
    durationMinutes: exam.durationMinutes,
    permittedResources: exam.permittedResources,
    generalInstructions: exam.generalInstructions,
    totalPoints: exam.marking.totalPoints,
    markingLabel: exam.marking.totalPoints != null ? exam.marking.label : null,
    sources: exam.sources.map((s) => ({
      id: s.id, title: s.title, kind: s.kind, label: s.label, lineNumbered: s.lineNumbered, text: s.text,
      citation: s.citation ? { author: s.citation.author, title: s.citation.title, publication: s.citation.publication, date: s.citation.date, url: s.citation.url, adapted: s.citation.adapted } : null,
    })),
    tasks: exam.tasks.map((t) => ({
      number: t.number, type: t.type, instruction: t.instruction, sourceIds: t.sourceIds, expectedLength: t.expectedLength,
      suggestedMinutes: t.suggestedMinutes, points: t.points,
    })),
  };
}
export type StudentExam = ReturnType<typeof studentView>;

// ---------------------------------------------------------------- assessment

export const ASSESSMENT_DIMENSIONS = [
  "task_fulfilment", "content", "argumentation", "structure", "source_analysis", "evidence", "vocabulary", "idiomaticity", "grammar", "register", "mechanics", "overall",
] as const;
export const DIMENSION_LABEL: Record<(typeof ASSESSMENT_DIMENSIONS)[number], string> = {
  task_fulfilment: "Task fulfilment and relevance",
  content: "Accuracy and depth of content",
  argumentation: "Argumentation and reasoning",
  structure: "Structure and coherence",
  source_analysis: "Analysis of the source text",
  evidence: "Use of textual evidence",
  vocabulary: "Precision and range of vocabulary",
  idiomaticity: "Naturalness and idiomaticity",
  grammar: "Grammar and sentence construction",
  register: "Register and academic style",
  mechanics: "Spelling and punctuation",
  overall: "Overall effectiveness and clarity",
};
export const LEVELS = ["excellent", "strong", "solid", "adequate", "weak", "very_weak", "not_assessed"] as const;
export const SEVERITIES = ["major", "moderate", "minor", "none"] as const;

export const commentSchema = z.object({
  id: z.string(),
  task: z.string(),
  original: z.string(),
  problem: z.string(),
  whyWeakens: z.string(),
  alternative: nstr,
  whyBetter: nstr,
  category: z.enum(["content", "language_error", "style", "optional_refinement", "structure", "task_fulfilment"]),
  englishStatus: z.enum(["incorrect", "unnatural", "imprecise", "valid_less_effective", "excellent", "not_language"]),
  severity: z.enum(SEVERITIES),
  provenance: z.enum(PROVENANCE),
  dimension: z.enum(ASSESSMENT_DIMENSIONS),
});
export type ExamComment = z.infer<typeof commentSchema> & { withdrawn?: boolean; history?: unknown[] };

export const labItemSchema = z.object({
  task: z.string(),
  original: z.string(),
  level1Correct: z.string(),
  level2Stronger: z.string(),
  level3HighLevel: nstr,
  explanation: z.object({
    effective: z.string(), nuance: z.string(), improves: z.array(z.enum(["reasoning", "structure", "analysis", "language"])), whyInContext: z.string(), risks: z.string(),
  }),
  exercise: z.object({ instruction: z.string(), material: nstr, answerKey: nstr }),
});

export const assessmentSchema = z.object({
  courseSpecific: z.object({
    rubricBasis: z.enum(["teacher_rubric", "teacher_criteria_partial", "none_available"]),
    rubricMaterialIds: z.array(z.string()),
    summary: z.string(),
    appliedCriteria: z.array(z.object({ criterion: z.string(), provenance: z.enum(PROVENANCE), judgement: z.string(), evidenceSufficient: z.boolean() })),
    insufficientEvidenceNotes: z.array(z.string()),
  }),
  independent: z.object({ summary: z.string(), standardsNote: z.string() }),
  dimensions: z.array(z.object({
    key: z.enum(ASSESSMENT_DIMENSIONS), task: nstr, applicable: z.boolean(), level: z.enum(LEVELS), comment: z.string(),
  })),
  strengths: z.array(z.object({ task: z.string(), original: z.string(), whyStrong: z.string() })),
  comments: z.array(commentSchema),
  estimate: z.object({
    low: z.number(),
    high: z.number(),
    best: z.number().nullable(),
    basis: z.enum(["teacher_rubric", "teacher_points_allocation", "approximation"]),
    assumptions: z.array(z.string()),
    evidence: z.array(z.string()),
    limitingFactors: z.array(z.string()),
    mostValuableChanges: z.array(z.string()),
  }),
  improvementPlan: z.array(z.object({ priority: z.number(), focus: z.string(), action: z.string(), skill: nstr })),
  lab: z.array(labItemSchema),
  modelAnswer: z.object({
    perTask: z.array(z.object({ task: z.string(), text: z.string(), whyEffective: z.array(z.string()) })),
    alternativeInterpretations: z.array(z.string()),
    comparisons: z.array(z.object({ task: z.string(), student: z.string(), model: z.string(), alreadyStrong: z.string(), difference: z.string() })),
  }),
  weaknessObservations: z.array(z.object({ skill: z.string(), present: z.boolean(), severity: z.enum(SEVERITIES), commentIds: z.array(z.string()), note: z.string() })),
  vocabUsage: z.array(z.object({ term: z.string(), used: z.boolean(), natural: z.boolean().nullable(), comment: z.string() })),
});
export type Assessment = Omit<z.infer<typeof assessmentSchema>, "comments"> & { comments: ExamComment[] };

export const ESTIMATE_DISCLAIMER =
  "Indicative AI estimate on the Bavarian 0–15 point scale. It is not an official grade and not a prediction of how your teacher will mark this work.";
