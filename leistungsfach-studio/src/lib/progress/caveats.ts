// Comparison caveats (progress-evaluation SKILL.md). Pure — unit-tested.
import { MODE_INFO, TASK_TYPES, type AssessmentMode, type TaskTypeKey } from "@/lib/curriculum";

export type ComparableAssessment = {
  taskType: TaskTypeKey;
  mode: AssessmentMode;
  low: number;
  high: number;
  best: number;
  confidence: "low" | "medium" | "high";
  hasTaskPrompt: boolean;
  hasSourceText: boolean;
  wordCount: number;
  timed: boolean;
  promptVersion: string | null;
};

export function comparisonCaveats(a: ComparableAssessment, b: ComparableAssessment): string[] {
  const c: string[] = [];
  if (a.taskType !== b.taskType) c.push(`Different task types (${TASK_TYPES[a.taskType].label} vs ${TASK_TYPES[b.taskType].label}): the change may reflect task difficulty rather than ability.`);
  if (a.mode !== b.mode) c.push(`Different assessment modes (${MODE_INFO[a.mode].label} vs ${MODE_INFO[b.mode].label}): modes resolve borderline cases differently.`);
  const missing = (x: ComparableAssessment) => !x.hasTaskPrompt || (TASK_TYPES[x.taskType].needsSourceText && !x.hasSourceText);
  if (missing(a) || missing(b)) c.push("At least one essay was assessed without its task prompt or source text, so that estimate is less reliable.");
  if (a.confidence === "low" || b.confidence === "low") c.push("At least one estimate has low confidence.");
  const ratio = Math.max(a.wordCount, b.wordCount) / Math.max(1, Math.min(a.wordCount, b.wordCount));
  if (ratio > 1.5) c.push("The essays differ a lot in length.");
  if (a.timed !== b.timed) c.push("One essay was written under time pressure and the other was not.");
  const major = (v: string | null) => (v ?? "").split("-").pop()?.split(".")[0];
  if (a.promptVersion && b.promptVersion && major(a.promptVersion) !== major(b.promptVersion)) c.push("The examiner's instructions changed between these assessments.");
  const overlap = Math.min(a.high, b.high) - Math.max(a.low, b.low);
  if (overlap >= 0) c.push(`The score ranges overlap (${a.low}–${a.high} and ${b.low}–${b.high}): the difference is within the margin of uncertainty.`);
  return c;
}
