/**
 * Spaced repetition via FSRS (ts-fsrs). See docs/LEARNING-ENGINE.md.
 *
 * The scheduler is deterministic: fuzz is disabled, so the same history
 * always produces the same due dates. The maximum interval is capped (one
 * year by default) so that even mastered words are tested again; nothing is
 * ever removed from revision.
 */
import { fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from "ts-fsrs";

export { Rating, State };

export type SchedulingState = {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
};

export type Outcome = "correct" | "alternative" | "typo" | "partial" | "wrong" | "revealed";

export type RatingInput = {
  outcome: Outcome;
  /** False when options were shown (multiple choice) or the answer was self-graded after reveal. */
  independent: boolean;
  /** Recognition-type exercise (choose from options). */
  recognitionOnly: boolean;
  hintsUsed: number;
  /** Learner's own Again/Hard/Good/Easy, if asked. */
  selfRating?: Grade;
  latencyMs?: number;
  /** Times the learner claimed to know a word and then failed it. */
  overconfidence?: number;
};

export const RATING_LABELS: Record<Grade, { label: string; meaning: string }> = {
  [Rating.Again]: { label: "Again", meaning: "I didn't know it (or got it wrong). Shown again soon." },
  [Rating.Hard]: { label: "Hard", meaning: "I got there, but with effort, a hint or a small slip. Shorter interval." },
  [Rating.Good]: { label: "Good", meaning: "I recalled it correctly. Normal interval." },
  [Rating.Easy]: { label: "Easy", meaning: "Instant and certain. Longer interval." },
};

/**
 * Combine objective evidence with self-assessment. Self-assessment can lower a
 * rating freely, but can only raise it when the objective result allows it.
 */
export function deriveRating(input: RatingInput): { rating: Grade; overconfident: boolean; reason: string } {
  const self = input.selfRating;
  if (input.outcome === "wrong" || input.outcome === "revealed") {
    const overconfident = self === Rating.Good || self === Rating.Easy;
    return { rating: Rating.Again, overconfident, reason: "not recalled" };
  }
  let ceiling: Grade = Rating.Easy;
  let base: Grade = Rating.Good;
  const reasons: string[] = [];
  if (input.recognitionOnly) {
    ceiling = Rating.Hard;
    base = Rating.Hard;
    reasons.push("recognised from options (not independent recall)");
  }
  if (!input.independent && !input.recognitionOnly) {
    // self-graded flip card: trust the learner, but cap when they have been overconfident before
    base = self ?? Rating.Good;
    if ((input.overconfidence ?? 0) >= 2) {
      ceiling = Rating.Hard;
      reasons.push("capped: earlier self-ratings were higher than actual recall");
    }
  }
  if (input.hintsUsed > 0) {
    ceiling = Math.min(ceiling, Rating.Hard) as Grade;
    reasons.push("hint used");
  }
  if (input.outcome === "typo" || input.outcome === "partial" || input.outcome === "alternative") {
    ceiling = Math.min(ceiling, Rating.Hard) as Grade;
    reasons.push(
      input.outcome === "typo"
        ? "small spelling slip"
        : input.outcome === "partial"
          ? "partly correct"
          : "valid alternative, but not the target word",
    );
  }
  let rating = base;
  if (input.independent && self !== undefined) {
    rating = self;
    if (self === Rating.Again) rating = Rating.Hard; // they did produce it; don't erase the success
  }
  if (input.independent && self === Rating.Easy && input.latencyMs !== undefined && input.latencyMs > 15000) {
    rating = Rating.Good;
    reasons.push("slow answer: Easy reduced to Good");
  }
  rating = Math.min(rating, ceiling) as Grade;
  return { rating, overconfident: false, reason: reasons.join("; ") || "recalled" };
}

export function makeScheduler(requestRetention = 0.9, maximumInterval = 365): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: Math.min(0.97, Math.max(0.75, requestRetention)),
      maximum_interval: maximumInterval,
      enable_fuzz: false,
      enable_short_term: true,
    }),
  );
}

export function newSchedulingState(now: Date): SchedulingState {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    lastReview: null,
  };
}

function toCard(s: SchedulingState): Card {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduledDays,
    learning_steps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ?? undefined,
  };
}

function fromCard(c: Card): SchedulingState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

export const MAX_INTERVAL_DAYS = 365;

export function schedule(
  state: SchedulingState,
  rating: Grade,
  reviewedAt: Date,
  scheduler = makeScheduler(),
  maxDays = MAX_INTERVAL_DAYS,
): SchedulingState {
  const { card } = scheduler.next(toCard(state), reviewedAt, rating);
  const next = fromCard(card);
  // ts-fsrs keeps Easy > Good by a day even at the maximum; enforce the cap strictly.
  const cap = reviewedAt.getTime() + maxDays * 86400000;
  if (next.due.getTime() > cap) {
    next.due = new Date(cap);
    next.scheduledDays = maxDays;
  }
  return next;
}

/** Preview the next due date for each grade (shown on the rating buttons). */
export function previewIntervals(state: SchedulingState, now: Date, scheduler = makeScheduler()): Record<Grade, Date> {
  const preview = scheduler.repeat(toCard(state), now);
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  } as Record<Grade, Date>;
}

export function retrievability(state: SchedulingState, now: Date, scheduler = makeScheduler()): number | null {
  if (state.state === State.New || !state.lastReview) return null;
  return scheduler.get_retrievability(toCard(state), now, false);
}

export function formatInterval(from: Date, to: Date): string {
  const mins = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo`;
  return `${(days / 365).toFixed(1)} y`;
}
