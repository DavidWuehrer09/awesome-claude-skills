/**
 * My Weaknesses: recurring problems across assessed exams, and what to
 * practise next. Mastery is never inferred from a single attempt.
 */
import type { Difficulty } from "./model";
import { DIFFICULTIES } from "./model";

export const TAXONOMY: Record<string, string> = {
  repetitive_analytical_phrasing: "Repetitive analytical phrasing",
  vague_authorial_intention: "Vague claims about authorial intention",
  insufficient_textual_evidence: "Insufficient textual evidence",
  underdeveloped_counterarguments: "Underdeveloped counterarguments",
  weak_transitions: "Weak paragraph transitions",
  awkward_collocations: "Awkward collocations",
  grammar_errors: "Grammar errors",
  imprecise_vocabulary: "Imprecise vocabulary",
  excessive_complexity: "Excessive sentence complexity",
  inadequate_task_fulfilment: "Inadequate task fulfilment",
  unclear_strong_ideas: "Strong ideas not expressed clearly enough",
  device_spotting_without_effect: "Naming devices without explaining their effect",
  summary_includes_opinion: "Personal opinion or detail in a summary",
  mediation_too_literal: "Mediation translates instead of selecting and adapting",
  register_slips: "Register slips (too informal / too ornate)",
  spelling_punctuation: "Spelling and punctuation",
  paragraph_structure: "Paragraph structure (topic sentence, development, link)",
  word_count_control: "Word-count control",
};

const WEIGHT = { major: 3, moderate: 2, minor: 1, none: 0 } as const;
export type Severity = keyof typeof WEIGHT;

export type WeaknessStatus = "no_data" | "secure_provisional" | "improving" | "no_problem_seen_yet" | "recurring" | "active";
export const STATUS_LABEL: Record<WeaknessStatus, string> = {
  no_data: "No data",
  secure_provisional: "Secure (provisional)",
  improving: "Improving",
  no_problem_seen_yet: "No problem seen yet",
  recurring: "Recurring",
  active: "Seen recently",
};

export type Observation = { assessmentId: string; date: string; present: boolean; severity: Severity; note: string };
export type SkillSummary = { skill: string; label: string; status: WeaknessStatus; history: Observation[]; priority: number; timesPresent: number };

export function skillLabel(skill: string) {
  return TAXONOMY[skill] ?? skill.replace(/^custom:/, "").replace(/_/g, " ");
}

/** "Secure" needs three consecutive clean attempts; two of the last three present = recurring. */
export function weaknessStatus(history: { present: boolean }[]): WeaknessStatus {
  if (!history.length) return "no_data";
  const flags = history.map((h) => h.present);
  let clean = 0;
  for (let i = flags.length - 1; i >= 0 && !flags[i]; i--) clean++;
  if (clean >= 3) return "secure_provisional";
  if (clean >= 1) return flags.some(Boolean) ? "improving" : "no_problem_seen_yet";
  return flags.slice(-3).filter(Boolean).length >= 2 ? "recurring" : "active";
}

/** Recent, severe and recurring problems first (each older attempt counts 0.6× the next). */
export function weaknessPriority(history: Observation[], status: WeaknessStatus) {
  let score = 0;
  [...history].reverse().forEach((h, age) => (score += WEIGHT[h.present ? h.severity : "none"] * 0.6 ** age));
  return Math.round(score * (status === "recurring" ? 1.5 : 1) * 100) / 100;
}

export function summarizeWeaknesses(observations: (Observation & { skill: string })[]): SkillSummary[] {
  const by = new Map<string, Observation[]>();
  for (const o of [...observations].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = by.get(o.skill) ?? [];
    list.push(o);
    by.set(o.skill, list);
  }
  return [...by.entries()].map(([skill, history]) => {
    const status = weaknessStatus(history);
    return { skill, label: skillLabel(skill), status, history, priority: weaknessPriority(history, status), timesPresent: history.filter((h) => h.present).length };
  });
}

export type ResultRow = { low: number; high: number; difficulty: Difficulty; version: number };

/** Adaptive next step from first-version results (revisions are not exam performance). */
export function recommendNext(skills: SkillSummary[], results: ResultRow[]) {
  const focus = skills.filter((s) => s.status === "recurring" || s.status === "active" || s.status === "improving").sort((a, b) => b.priority - a.priority);
  const rows = results.filter((r) => r.version === 1);
  const advice: string[] = [];
  let difficulty: Difficulty = "realistic";
  if (!rows.length) {
    advice.push("No assessed exam yet: start with a realistic exam to establish a baseline.");
  } else {
    const mids = rows.slice(-3).map((r) => (r.low + r.high) / 2);
    const cur = rows[rows.length - 1].difficulty;
    const idx = Math.max(0, DIFFICULTIES.indexOf(cur));
    const recurringMajor = focus.some((f) => f.status === "recurring" && f.priority >= 4);
    if (rows.length >= 2 && mids.slice(-2).every((m) => m >= 12) && !recurringMajor) {
      difficulty = DIFFICULTIES[Math.min(idx + 1, DIFFICULTIES.length - 1)];
      advice.push("Two strong results in a row without recurring major problems: raise the demand.");
    } else if (mids.length >= 2 && mids.slice(-2).every((m) => m < 7)) {
      difficulty = DIFFICULTIES[Math.max(idx - 1, 0)];
      advice.push("Two results below 7 points in a row: consolidate before raising the difficulty.");
    } else {
      difficulty = cur;
      advice.push("Keep the current difficulty and target your focus skills.");
    }
    if (rows.length === 1) advice.push("Only one assessed exam so far: these recommendations are provisional.");
  }
  return {
    difficulty,
    focus: focus.slice(0, 6),
    drills: Object.fromEntries(focus.slice(0, 4).map((f) => [f.skill, f.status === "recurring" ? 3 : f.status === "active" ? 2 : 1])),
    advice,
    secure: skills.filter((s) => s.status === "secure_provisional").map((s) => s.skill),
  };
}
