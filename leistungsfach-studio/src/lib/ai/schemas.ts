// Structured-output schemas for every AI operation. These are sent to the API as JSON schema
// and re-validated locally with Zod (the API transform turns some constraints into descriptions).
import { z } from "zod";
import { DIMENSION_KEYS } from "@/lib/curriculum/dimensions";
import { SKILL_KEYS } from "@/lib/learner/skills";
import { DIFFICULTIES, EXERCISE_TYPES, REVISION_CATEGORIES } from "./constants";
export { DIFFICULTIES, EXERCISE_TYPES, REVISION_CATEGORIES };
export type { Difficulty, ExerciseType, RevisionCategory } from "./constants";

const Score = z.number().min(0).max(15);
const SkillKeyEnum = z.enum(SKILL_KEYS);
const Polarity = z.enum(["strength", "weakness", "neutral"]);

// ---------- Assessment ----------
export const AssessmentOutputSchema = z.object({
  task_understanding: z.string().describe("One or two sentences: what the task and operator require, in your own words."),
  dimensions: z.array(z.object({
    key: z.enum(DIMENSION_KEYS),
    low: Score, best: Score, high: Score,
    rationale: z.string().describe("Why this range, referring to the band descriptors and the evidence."),
    evidence: z.array(z.object({ quote: z.string().describe("Verbatim excerpt from the essay"), comment: z.string() })),
  })),
  strengths: z.array(z.object({ title: z.string(), quote: z.string(), why_it_works: z.string(), dimension: z.enum(DIMENSION_KEYS) })),
  weaknesses: z.array(z.object({
    title: z.string(),
    severity: z.enum(["major", "minor"]),
    kind: z.enum(["conceptual", "language"]),
    dimension: z.enum(DIMENSION_KEYS),
    quotes: z.array(z.string()).describe("Verbatim excerpts from the essay that show the weakness"),
    explanation: z.string(),
    why_it_matters: z.string(),
    how_to_fix: z.string(),
  })),
  action_plan: z.array(z.object({ priority: z.number().int().min(1).max(10), action: z.string(), skill_key: SkillKeyEnum, why: z.string() })),
  overall_comment: z.string(),
  holistic_check: z.object({ low: Score, high: Score }).describe("Your independent overall impression, used only as a cross-check of the computed score."),
  confidence: z.enum(["low", "medium", "high"]),
  uncertainty_notes: z.array(z.string()),
  curriculum_references: z.array(z.string()).describe("Which curriculum expectations you applied, with their provenance labels."),
  vocabulary_suggestions: z.array(z.object({ term: z.string(), meaning: z.string(), why_useful: z.string(), example: z.string() })),
});
export type AssessmentOutput = z.infer<typeof AssessmentOutputSchema>;

// ---------- Revision ----------

export const RevisionOutputSchema = z.object({
  overview: z.string().describe("What the revision focuses on and what was deliberately left unchanged."),
  edits: z.array(z.object({
    target_ids: z.array(z.string()).describe("Contiguous sentence ids this edit replaces, e.g. [\"p2s3\"]"),
    revised_text: z.string().describe("Replacement text for those sentences. Empty string = delete them."),
    category: z.enum(REVISION_CATEGORIES),
    explanation: z.string().describe("What was wrong or weaker, and what changed."),
    principle: z.string().describe("The general principle this change illustrates."),
    how_to_apply: z.string().describe("How the student can apply the principle independently next time."),
    is_new_idea: z.boolean().describe("True if the revision adds content the student did not write."),
    needs_evidence_note: z.string().nullable().describe("For new ideas: what textual evidence would justify it."),
  })),
  phrase_upgrades: z.array(z.object({
    original: z.string().describe("Verbatim phrase from the student's essay"),
    upgraded: z.string().describe("A more precise, sophisticated but natural alternative"),
    why: z.string().describe("Why the upgrade is better here"),
    when_to_use: z.string().describe("When the student can reuse it (and when not)"),
  })).describe("Reusable phrase-level upgrades. Empty for depth 'corrections'."),
  ideas_for_15: z.array(z.object({
    idea: z.string().describe("A concrete improvement the student should make themselves"),
    why_it_raises_the_mark: z.string(),
    where: z.string().describe("Which paragraph or part of the essay"),
    needs_evidence: z.string().nullable().describe("Textual evidence needed, if the idea adds content"),
  })).describe("What would lift the essay towards 15 points. Empty for depth 'corrections'."),
});
export type RevisionOutput = z.infer<typeof RevisionOutputSchema>;

// ---------- Explanation of one change ----------
export const ExplanationOutputSchema = z.object({
  explanation: z.string(),
  principle: z.string(),
  examples: z.array(z.object({ before: z.string(), after: z.string(), note: z.string() })),
  common_mistakes: z.array(z.string()),
  practice: z.object({ instruction: z.string(), items: z.array(z.string()) }),
  self_check: z.string().describe("A question the student can ask themselves while writing."),
});
export type ExplanationOutput = z.infer<typeof ExplanationOutputSchema>;

// ---------- Learner update ----------
export const ObservationSchema = z.object({
  skill_key: SkillKeyEnum,
  polarity: Polarity,
  quote: z.string().describe("Verbatim excerpt from the student's text"),
  note: z.string(),
  level_estimate: Score.nullable(),
});

export const LearnerUpdateOutputSchema = z.object({
  observations: z.array(ObservationSchema),
  error_patterns: z.array(z.object({
    existing_pattern_id: z.string().nullable(),
    label: z.string().describe("Short, general label, e.g. 'discuss + about (no preposition)'"),
    category: z.enum(["grammar", "collocation", "vocabulary", "register", "structure", "analysis", "argument", "evidence", "other"]),
    skill_key: SkillKeyEnum,
    example_quote: z.string(),
    correction: z.string(),
    explanation: z.string(),
  })),
  checked_absent_pattern_ids: z.array(z.string()).describe("Ids of known patterns you checked for and found absent in this text."),
});
export type LearnerUpdateOutput = z.infer<typeof LearnerUpdateOutputSchema>;

// ---------- Exercises ----------

export const ExerciseOutputSchema = z.object({
  title: z.string(),
  objective: z.string(),
  instructions: z.string(),
  passage: z.string().nullable().describe("Original practice text written for this exercise, if needed"),
  items: z.array(z.object({ id: z.string(), prompt: z.string() })),
  success_criteria: z.array(z.string()),
  model_answer: z.string(),
  answer_key: z.array(z.object({ item_id: z.string(), answer: z.string(), explanation: z.string() })),
});
export type ExerciseOutput = z.infer<typeof ExerciseOutputSchema>;

export const ExerciseEvaluationOutputSchema = z.object({
  outcome: z.enum(["correct", "partial", "incorrect"]),
  score: z.number().min(0).max(1),
  item_feedback: z.array(z.object({ item_id: z.string(), verdict: z.enum(["correct", "partial", "incorrect"]), comment: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  corrected_version: z.string().nullable(),
  follow_up: z.string(),
  observations: z.array(ObservationSchema),
});
export type ExerciseEvaluationOutput = z.infer<typeof ExerciseEvaluationOutputSchema>;

// ---------- Progress review ----------
export const ProgressReviewOutputSchema = z.object({
  summary: z.string(),
  improvements: z.array(z.object({ statement: z.string(), evidence: z.string() })),
  concerns: z.array(z.object({ statement: z.string(), evidence: z.string() })),
  comparability_cautions: z.array(z.string()),
  next_steps: z.array(z.string()),
});
export type ProgressReviewOutput = z.infer<typeof ProgressReviewOutputSchema>;

// ---------- Vocabulary use check ----------
export const VocabUseOutputSchema = z.object({
  outcome: z.enum(["correct", "partial", "incorrect"]),
  used_target: z.boolean(),
  natural: z.boolean(),
  feedback: z.string(),
  corrected_sentence: z.string().nullable(),
});
export type VocabUseOutput = z.infer<typeof VocabUseOutputSchema>;

// ---------- Teacher feedback analysis ----------
export const TeacherAnalysisOutputSchema = z.object({
  observations: z.array(z.object({
    statement: z.string().describe("A specific, general-enough tendency, e.g. 'Expects line references for every quotation'"),
    category: z.enum(["content", "structure", "language", "evidence", "format", "other"]),
    quote: z.string().describe("Verbatim excerpt from the teacher's comments or criteria"),
  })),
  criteria_summary: z.string(),
  notes: z.array(z.string()),
});
export type TeacherAnalysisOutput = z.infer<typeof TeacherAnalysisOutputSchema>;
