// Spaced-review scheduling: 1 → 3 → 7 → 16 → 35 → 75 days. Pure.
export const INTERVALS = [1, 3, 7, 16, 35, 75] as const;
export type ReviewOutcome = "correct" | "partial" | "incorrect";

/** correct → next longer interval; partial → repeat the current interval; incorrect → back to 1 day. */
export function nextInterval(currentDays: number, outcome: ReviewOutcome): number {
  if (outcome === "incorrect") return 1;
  if (outcome === "partial") return Math.max(1, currentDays);
  return INTERVALS.find((d) => d > currentDays) ?? INTERVALS[INTERVALS.length - 1];
}

export function scheduleNext(currentDays: number, outcome: ReviewOutcome, now = new Date()) {
  const days = nextInterval(currentDays, outcome);
  return { intervalDays: days, nextReviewAt: new Date(now.getTime() + days * 86400000) };
}

export function isDue(nextReviewAt: Date | null, now = new Date()) {
  return nextReviewAt !== null && nextReviewAt.getTime() <= now.getTime();
}
