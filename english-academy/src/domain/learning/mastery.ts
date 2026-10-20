/**
 * Per-word mastery across eight knowledge dimensions. Recognition alone never
 * produces "mastered": production and use in writing are required.
 */
import type { DimensionScore, MasteryDimension, MasteryMap } from "@/db/schema";

export const DIMENSIONS: { key: MasteryDimension; label: string; weight: number }[] = [
  { key: "recognition", label: "Recognition", weight: 0.08 },
  { key: "meaning", label: "Meaning recall", weight: 0.2 },
  { key: "spelling", label: "Spelling & form", weight: 0.1 },
  { key: "collocation", label: "Collocations", weight: 0.14 },
  { key: "grammar", label: "Grammatical use", weight: 0.1 },
  { key: "context", label: "Context", weight: 0.12 },
  { key: "production", label: "Active production", weight: 0.14 },
  { key: "writing", label: "Use in writing", weight: 0.12 },
];

export type MasteryLevel = "new" | "learning" | "recognised" | "recalled" | "productive" | "mastered";

export const LEVEL_LABEL: Record<MasteryLevel, string> = {
  new: "New",
  learning: "Learning",
  recognised: "Recognised",
  recalled: "Recalled",
  productive: "Used actively",
  mastered: "Mastered",
};

/** Exponentially weighted update; early evidence moves the score faster. */
export function updateDimension(prev: DimensionScore | undefined, success: number, at: Date): DimensionScore {
  const n = (prev?.n ?? 0) + 1;
  const old = prev?.score ?? 0;
  const alpha = Math.max(0.25, 1 / n);
  const score = Math.min(1, Math.max(0, old + alpha * (success - old)));
  return { score: Math.round(score * 1000) / 1000, n, last: at.toISOString() };
}

export function applyEvidence(map: MasteryMap, evidence: Partial<Record<MasteryDimension, number>>, at: Date): MasteryMap {
  const next: MasteryMap = { ...map };
  for (const [dim, success] of Object.entries(evidence) as [MasteryDimension, number][]) {
    next[dim] = updateDimension(map[dim], success, at);
  }
  return next;
}

const score = (m: MasteryMap, d: MasteryDimension) => m[d]?.score ?? 0;
const seen = (m: MasteryMap, d: MasteryDimension) => (m[d]?.n ?? 0) > 0;

export function overallMastery(m: MasteryMap): number {
  return Math.round(DIMENSIONS.reduce((acc, d) => acc + d.weight * score(m, d.key), 0) * 100) / 100;
}

export function masteryLevel(m: MasteryMap, stabilityDays: number): MasteryLevel {
  if (!DIMENSIONS.some((d) => seen(m, d.key))) return "new";
  const meaning = Math.max(score(m, "meaning"), score(m, "spelling") * 0.8);
  if (score(m, "production") >= 0.7 && score(m, "writing") >= 0.6 && meaning >= 0.7 && stabilityDays >= 21) return "mastered";
  if (score(m, "production") >= 0.6 && meaning >= 0.6) return "productive";
  if (meaning >= 0.6) return "recalled";
  if (score(m, "recognition") >= 0.6) return "recognised";
  return "learning";
}

/** The weakest dimension that has data, or the first one without data, in learning order. */
export function weakestDimension(m: MasteryMap): MasteryDimension {
  const order: MasteryDimension[] = ["meaning", "spelling", "context", "collocation", "grammar", "production", "writing"];
  const unseen = order.find((d) => !seen(m, d));
  const weakSeen = order.filter((d) => seen(m, d)).sort((a, b) => score(m, a) - score(m, b))[0];
  if (weakSeen && score(m, weakSeen) < 0.6) return weakSeen;
  return unseen ?? weakSeen ?? "meaning";
}
