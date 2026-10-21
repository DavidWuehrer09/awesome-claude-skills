/**
 * Session queue construction. Pure function: given the learner's states, it
 * decides what to show and why. Overdue words are never dropped: when the
 * daily review limit is reached they stay due and are reported as deferred.
 */
import type { MasteryMap } from "@/db/schema";
import { State } from "./scheduler";

export type QueueState = {
  entryId: string;
  due: Date;
  state: number;
  reps: number;
  lapses: number;
  stability: number;
  lastReview: Date | null;
  mastery: MasteryMap;
  markedDifficult: boolean;
  topicIds: string[];
  introduced: boolean;
};

export type QueueReason = "overdue" | "due" | "relearning" | "new" | "weak_production" | "weak_collocation" | "not_in_writing" | "difficult" | "exam_prep" | "practice";

export type QueueItem = { entryId: string; reason: QueueReason; schedule: boolean };

export type QueueOptions = {
  now: Date;
  endOfDay: Date;
  minutes: number;
  newLimitRemaining: number;
  reviewLimitRemaining: number;
  mode: "review" | "focused" | "mixed" | "practice";
  topicId?: string | null;
  secondsPerItem?: number;
  /**
   * Set when the exam is close (see examPrepActive): words in these topics get
   * a larger share of the extra-practice slots. topicIds null = every word.
   */
  examFocus?: { topicIds: string[] | null } | null;
};

/** Exam preparation weighting applies from 8 weeks before the exam date (YYYY-MM-DD) until the exam day. */
export const EXAM_PREP_DAYS = 56;

export function examPrepActive(examDate: string | null | undefined, now: Date): boolean {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((Date.parse(`${examDate}T00:00:00Z`) - today) / 86400000);
  return days >= 0 && days <= EXAM_PREP_DAYS;
}

/** Share of the session reserved for extra practice (not due) in mixed/focused sessions. */
const EXTRA_SHARE = 0.25;
const EXTRA_SHARE_EXAM = 0.4;
/** With an exam close, this part of the extra slots goes to exam-relevant words first. */
const EXAM_QUOTA = 2 / 3;

export type QueueResult = {
  items: QueueItem[];
  dueTotal: number;
  overdueTotal: number;
  deferred: number;
  newAvailable: number;
};

/** Round-robin across topics so consecutive cards come from different topics. */
export function interleave<T extends { topicKey: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groups.get(it.topicKey) ?? [];
    g.push(it);
    groups.set(it.topicKey, g);
  }
  const lists = [...groups.values()];
  const out: T[] = [];
  let i = 0;
  while (out.length < items.length) {
    const list = lists[i % lists.length];
    const next = list.shift();
    if (next) out.push(next);
    i++;
    if (lists.every((l) => !l.length)) break;
  }
  return out;
}

/** Lower = more in need of exam practice: the weaker of active production and collocations. */
function examWeakness(s: QueueState): number {
  return Math.min(s.mastery.production?.score ?? 0, s.mastery.collocation?.score ?? 0);
}

export function buildQueue(states: QueueState[], opts: QueueOptions): QueueResult {
  const capacity = Math.max(5, Math.round((opts.minutes * 60) / (opts.secondsPerItem ?? 20)));
  const inScope = opts.topicId ? states.filter((s) => s.topicIds.includes(opts.topicId!)) : states;
  const now = opts.now.getTime();
  const reviewed = inScope.filter((s) => s.introduced && s.state !== State.New);
  const dueToday = reviewed.filter((s) => s.due.getTime() < opts.endOfDay.getTime());
  const overdue = dueToday.filter((s) => s.due.getTime() <= now);
  const newOnes = inScope.filter((s) => !s.introduced || s.state === State.New);

  // Most overdue (relative to its interval) first; relearning cards first of all.
  const urgency = (s: QueueState) => {
    const late = Math.max(0, now - s.due.getTime()) / 86400000;
    return (s.state === State.Relearning || s.state === State.Learning ? 1000 : 0) + late / Math.max(1, s.stability);
  };
  const dueSorted = [...dueToday].sort((a, b) => urgency(b) - urgency(a));
  const reviewBudget = Math.min(capacity, opts.reviewLimitRemaining);
  const dueTaken = dueSorted.slice(0, reviewBudget);
  const deferred = dueSorted.length - dueTaken.length;

  const items: (QueueItem & { topicKey: string })[] = dueTaken.map((s) => ({
    entryId: s.entryId,
    reason: s.state === State.Relearning || s.state === State.Learning ? "relearning" : s.due.getTime() <= now ? "overdue" : "due",
    schedule: true,
    topicKey: s.topicIds[0] ?? "none",
  }));

  let room = capacity - items.length;
  if (room > 0 && opts.mode !== "review") {
    // Extra practice for words that are scheduled later but weak in some dimension.
    const notDue = reviewed.filter((s) => s.due.getTime() >= opts.endOfDay.getTime());
    const weak = notDue
      .map((s): { s: QueueState; reason: QueueReason } | null => {
        const prod = s.mastery.production?.score ?? 0;
        const col = s.mastery.collocation?.score ?? 0;
        const writing = s.mastery.writing?.n ?? 0;
        const reason: QueueReason | null = s.markedDifficult || s.lapses >= 3
          ? "difficult"
          : s.stability > 7 && prod < 0.6
            ? "weak_production"
            : s.stability > 7 && col < 0.5
              ? "weak_collocation"
              : s.stability > 21 && writing === 0
                ? "not_in_writing"
                : opts.mode === "practice"
                  ? "practice"
                  : null;
        return reason ? { s, reason } : null;
      })
      .filter((x): x is { s: QueueState; reason: QueueReason } => !!x)
      .sort((a, b) => (b.s.lapses - a.s.lapses) || ((a.s.mastery.production?.score ?? 0) - (b.s.mastery.production?.score ?? 0)));
    const exam = opts.examFocus;
    const takeWeak = opts.mode === "practice" ? room : Math.min(room, Math.ceil(capacity * (exam ? EXTRA_SHARE_EXAM : EXTRA_SHARE)));
    const extra: { s: QueueState; reason: QueueReason }[] = [];
    if (exam) {
      // Exam close: every word of the exam-relevant topics is a candidate (not only weak ones),
      // weakest production/collocation first; they fill most of the extra slots.
      const weakReason = new Map(weak.map((w) => [w.s.entryId, w.reason]));
      const relevant = notDue
        .filter((s) => !exam.topicIds || s.topicIds.some((t) => exam.topicIds!.includes(t)))
        .map((s) => ({ s, reason: weakReason.get(s.entryId) ?? ("exam_prep" as QueueReason) }))
        .sort((a, b) => examWeakness(a.s) - examWeakness(b.s) || (b.s.lapses - a.s.lapses));
      const quota = Math.ceil(takeWeak * EXAM_QUOTA);
      extra.push(...relevant.slice(0, quota));
      const picked = new Set(extra.map((x) => x.s.entryId));
      extra.push(...weak.filter((w) => !picked.has(w.s.entryId)), ...relevant.slice(quota));
    } else {
      extra.push(...weak);
    }
    const seen = new Set<string>();
    for (const { s, reason } of extra) {
      if (seen.size >= takeWeak) break;
      if (seen.has(s.entryId)) continue;
      seen.add(s.entryId);
      items.push({ entryId: s.entryId, reason, schedule: false, topicKey: s.topicIds[0] ?? "none" });
    }
    room = capacity - items.length;
    if (opts.mode === "practice" && room > 0) {
      // Free practice works on any word (also new ones) without touching the schedule.
      const taken = new Set(items.map((i) => i.entryId));
      const rest = [...notDue.filter((s) => !taken.has(s.entryId)), ...newOnes.filter((s) => !taken.has(s.entryId))];
      for (const s of rest.slice(0, room)) items.push({ entryId: s.entryId, reason: "practice", schedule: false, topicKey: s.topicIds[0] ?? "none" });
      room = capacity - items.length;
    }
  }
  if (room > 0 && opts.mode !== "practice") {
    const newTake = Math.min(room, opts.newLimitRemaining);
    for (const s of newOnes.slice(0, newTake)) {
      items.push({ entryId: s.entryId, reason: "new", schedule: true, topicKey: s.topicIds[0] ?? "none" });
    }
  }
  const ordered = opts.mode === "focused" ? items : interleave(items);
  return {
    items: ordered.map(({ entryId, reason, schedule }) => ({ entryId, reason, schedule })),
    dueTotal: dueToday.length,
    overdueTotal: overdue.length,
    deferred,
    newAvailable: newOnes.length,
  };
}

export const REASON_LABEL: Record<QueueReason, string> = {
  overdue: "Overdue review",
  due: "Due today",
  relearning: "Recently forgotten",
  new: "New word",
  weak_production: "Weak active use",
  weak_collocation: "Weak collocations",
  not_in_writing: "Not yet used in writing",
  difficult: "Difficult word",
  exam_prep: "Exam preparation",
  practice: "Extra practice",
};
