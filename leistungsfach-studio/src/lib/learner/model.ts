// Deterministic learner-model rules (learner-modelling SKILL.md). Pure functions — unit-tested.
import type { SkillKey } from "./skills";

export type EvidenceItem = {
  skillKey: SkillKey;
  submissionKey: string;
  sourceType: "assessment" | "exercise" | "teacher" | "manual_note";
  polarity: "strength" | "weakness" | "neutral";
  levelEstimate: number | null;
  isTransfer: boolean;
  createdAt: Date;
};

export type PatternStatus = "single" | "recurring" | "improving" | "resolved_provisional";
export type PatternState = {
  skillKey: SkillKey;
  occurrences: { submissionKey: string; at: string }[];
  cleanSubmissions: { submissionKey: string; at: string; isTransfer: boolean }[];
};

export type Trend = "improving" | "declining" | "stable" | "insufficient_data";
export type MasteryStatus =
  | "not_assessed" | "emerging" | "developing" | "recurring_weakness" | "improving" | "appears_secure_untested" | "secure";

export type SkillComputation = {
  level: number | null;
  confidence: number;
  trend: Trend;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  sourceCount: number;
  recommendedAction: string;
};

const RECENCY_WEIGHTS = [1, 0.85, 0.7, 0.55, 0.45, 0.35];

/** One level estimate per submission (mean of that submission's estimates), newest first. */
export function perSubmissionLevels(items: EvidenceItem[]) {
  const bySub = new Map<string, { sum: number; n: number; at: number; transfer: boolean; weak: boolean }>();
  for (const e of items) {
    const cur = bySub.get(e.submissionKey) ?? { sum: 0, n: 0, at: 0, transfer: false, weak: false };
    if (e.levelEstimate !== null) { cur.sum += e.levelEstimate; cur.n += 1; }
    cur.at = Math.max(cur.at, e.createdAt.getTime());
    cur.transfer ||= e.isTransfer;
    cur.weak ||= e.polarity === "weakness";
    bySub.set(e.submissionKey, cur);
  }
  return [...bySub.entries()]
    .map(([key, v]) => ({ key, level: v.n ? v.sum / v.n : null, at: v.at, transfer: v.transfer, weak: v.weak }))
    .sort((a, b) => b.at - a.at);
}

export function patternStatus(p: PatternState): PatternStatus {
  const occSubs = new Set(p.occurrences.map((o) => o.submissionKey));
  if (occSubs.size <= 1 && p.cleanSubmissions.length === 0) return "single";
  const lastOcc = Math.max(...p.occurrences.map((o) => Date.parse(o.at)), 0);
  const cleanAfter = p.cleanSubmissions.filter((c) => Date.parse(c.at) > lastOcc && !occSubs.has(c.submissionKey));
  const cleanSubs = new Set(cleanAfter.map((c) => c.submissionKey));
  const transferClean = cleanAfter.some((c) => c.isTransfer);
  if (occSubs.size >= 2) {
    if (cleanSubs.size >= 3 && transferClean) return "resolved_provisional";
    if (cleanSubs.size >= 2) return "improving";
    return "recurring";
  }
  // seen once, then checked clean afterwards
  if (cleanSubs.size >= 3 && transferClean) return "resolved_provisional";
  return "single";
}

export function computeSkill(items: EvidenceItem[], patterns: PatternState[], now = new Date()): SkillComputation {
  const subs = perSubmissionLevels(items);
  const leveled = subs.filter((s) => s.level !== null) as { key: string; level: number; at: number; transfer: boolean; weak: boolean }[];
  const evidenceCount = items.length;
  const sourceCount = subs.length;

  let level: number | null = null;
  if (leveled.length) {
    let w = 0, sum = 0;
    leveled.slice(0, RECENCY_WEIGHTS.length).forEach((s, i) => { sum += RECENCY_WEIGHTS[i] * s.level; w += RECENCY_WEIGHTS[i]; });
    level = Math.round((sum / w) * 10) / 10;
  }

  // Confidence: number of independent submissions, consistency, recency.
  let confidence = 0;
  if (leveled.length) {
    const n = leveled.length;
    const base = 1 - Math.exp(-n / 2.5); // 1→0.33, 2→0.55, 3→0.70, 5→0.86
    const recent = leveled.slice(0, 6).map((s) => s.level);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
    const consistency = Math.max(0.4, 1 - sd / 6);
    const ageDays = (now.getTime() - leveled[0].at) / 86400000;
    const recency = ageDays > 60 ? 0.7 : ageDays > 30 ? 0.85 : 1;
    confidence = base * consistency * recency;
    if (n === 1) confidence = Math.min(confidence, 0.4);
    confidence = Math.round(confidence * 100) / 100;
  }

  let trend: Trend = "insufficient_data";
  if (leveled.length >= 4) {
    const last = leveled.slice(0, 3).map((s) => s.level);
    const prev = leveled.slice(3, 6).map((s) => s.level);
    const d = last.reduce((a, b) => a + b, 0) / last.length - prev.reduce((a, b) => a + b, 0) / prev.length;
    trend = d >= 1 ? "improving" : d <= -1 ? "declining" : "stable";
  }

  const activeRecurring = patterns.filter((p) => patternStatus(p) === "recurring");
  const independentSources = new Set(leveled.map((s) => s.key)).size;
  const hasTransfer = leveled.some((s) => s.transfer);
  const recentWeak = subs.slice(0, 3).some((s) => s.weak);

  let masteryStatus: MasteryStatus;
  if (!subs.length) masteryStatus = "not_assessed";
  else if (activeRecurring.length) masteryStatus = "recurring_weakness";
  else if (level === null) masteryStatus = "emerging";
  else if (level >= 12 && independentSources >= 3 && hasTransfer && !recentWeak) masteryStatus = "secure";
  else if (level >= 12) masteryStatus = "appears_secure_untested";
  else if (trend === "improving") masteryStatus = "improving";
  else if (level < 7) masteryStatus = "emerging";
  else masteryStatus = "developing";

  return { level, confidence, trend, masteryStatus, evidenceCount, sourceCount, recommendedAction: recommendAction(masteryStatus, activeRecurring.length, confidence) };
}

export function recommendAction(status: MasteryStatus, recurringCount: number, confidence: number): string {
  switch (status) {
    case "not_assessed": return "No evidence yet — an essay or a diagnostic exercise will show where you stand.";
    case "recurring_weakness": return `Targeted practice on the recurring pattern${recurringCount > 1 ? "s" : ""}, then check for it in your next essay.`;
    case "emerging": return "Foundation exercise with a worked example, then a short guided attempt.";
    case "developing": return confidence < 0.5 ? "Diagnostic exercise to confirm the level, then core practice." : "Core-level practice; aim to apply it unprompted in your next essay.";
    case "improving": return "Keep going: one stretch exercise and watch for it in your next essay.";
    case "appears_secure_untested": return "Looks strong but not yet proven across contexts — try a transfer task on a new text.";
    case "secure": return "Maintain with occasional exam-level tasks; focus effort elsewhere.";
  }
}

export const MASTERY_LABEL: Record<MasteryStatus, string> = {
  not_assessed: "Not assessed yet",
  emerging: "Emerging",
  developing: "Developing",
  recurring_weakness: "Recurring weakness",
  improving: "Improving",
  appears_secure_untested: "Appears secure — not yet tested enough",
  secure: "Secure",
};

export const PATTERN_LABEL: Record<PatternStatus, string> = {
  single: "Seen once",
  recurring: "Recurring",
  improving: "Improving",
  resolved_provisional: "Resolved (provisional)",
};
