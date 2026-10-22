// Deterministic score aggregation (SKILL.md §2.4, §4). Pure function — unit-tested.
import { ASSESSMENT_RULES, DIMENSIONS, TASK_TYPES, type DimensionKey, type TaskTypeKey } from "@/lib/curriculum";

export type DimensionRange = { key: DimensionKey; low: number; best: number; high: number };

export type AggregateResult = {
  low: number;
  best: number;
  high: number;
  content: { low: number; best: number; high: number } | null;
  language: { low: number; best: number; high: number } | null;
  method: "reported_40_60" | "equal_groups" | "single_group";
  capApplied: boolean;
  notes: string[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(15, n));

function groupMean(dims: DimensionRange[], weights: Partial<Record<DimensionKey, number>>) {
  if (!dims.length) return null;
  let wSum = 0, lo = 0, be = 0, hi = 0;
  for (const d of dims) {
    const w = weights[d.key] ?? 1;
    wSum += w; lo += w * d.low; be += w * d.best; hi += w * d.high;
  }
  return { low: lo / wSum, best: be / wSum, high: hi / wSum };
}

export function aggregateScore(dimensions: DimensionRange[], taskType: TaskTypeKey, opts: { useReportedWeighting: boolean }): AggregateResult {
  const weights = TASK_TYPES[taskType].weights;
  const content = groupMean(dimensions.filter((d) => DIMENSIONS[d.key].group === "content"), weights);
  const language = groupMean(dimensions.filter((d) => DIMENSIONS[d.key].group === "language"), weights);
  const notes: string[] = [];
  let method: AggregateResult["method"];
  let low: number, best: number, high: number;
  let capApplied = false;

  if (content && language) {
    const cw = opts.useReportedWeighting ? ASSESSMENT_RULES.contentWeight : 0.5;
    const lw = 1 - cw;
    method = opts.useReportedWeighting ? "reported_40_60" : "equal_groups";
    low = cw * content.low + lw * language.low;
    best = cw * content.best + lw * language.best;
    high = cw * content.high + lw * language.high;
    notes.push(
      opts.useReportedWeighting
        ? "Combined as content 40 % / language 60 % — the ratio reported for the Bavarian KMS (unverified)."
        : "Combined as content 50 % / language 50 % (reported weighting switched off in Settings).",
    );
    if (opts.useReportedWeighting) {
      const t = ASSESSMENT_RULES.contentCapThreshold;
      const cap = ASSESSMENT_RULES.contentCapValue;
      if (content.high < t) {
        capApplied = true;
        low = Math.min(low, cap); best = Math.min(best, cap); high = Math.min(high, cap);
        notes.push(`Content is below ${t} points, so the result is capped at ${cap} (reported KMS rule, unverified).`);
      } else if (content.low < t) {
        low = Math.min(low, cap);
        notes.push(`Content may be below ${t} points; the lower end of the range reflects the reported cap at ${cap}.`);
      }
    }
  } else {
    method = "single_group";
    const g = (content ?? language)!;
    low = g.low; best = g.best; high = g.high;
    notes.push("Only one dimension group applies; no content/language weighting used.");
  }

  low = clamp(low); best = clamp(best); high = clamp(high);
  // Report whole points the way the scale works, keeping the range honest (floor/ceil outward).
  const result = {
    low: Math.floor(low + 1e-9),
    best: Math.round(best),
    high: Math.ceil(high - 1e-9),
  };
  result.best = Math.min(Math.max(result.best, result.low), result.high);
  return {
    ...result,
    content: content ? { low: r1(content.low), best: r1(content.best), high: r1(content.high) } : null,
    language: language ? { low: r1(language.low), best: r1(language.best), high: r1(language.high) } : null,
    method,
    capApplied,
    notes,
  };
}
