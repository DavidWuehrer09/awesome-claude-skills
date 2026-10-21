import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  examMaterials,
  learningStates,
  reviewEvents,
  studySessions,
  topicMemberships,
  topics,
  userSettings,
  vocabEntries,
  vocabExamples,
  type MasteryMap,
} from "@/db/schema";
import {
  adaptiveVariants,
  chooseKind,
  evidenceFor,
  generateExercise,
  retryExercises,
  type EntryLite,
  type Exercise,
  type ExerciseKind,
} from "@/domain/learning/exercises";
import { applyEvidence } from "@/domain/learning/mastery";
import {
  deriveRating,
  formatInterval,
  makeScheduler,
  newSchedulingState,
  previewIntervals,
  schedule,
  State,
  type SchedulingState,
} from "@/domain/learning/scheduler";
import { buildQueue, examPrepActive, type QueueReason, type QueueState } from "@/domain/learning/selection";
import { endOfLocalDay, startOfLocalDay } from "@/lib/time";
import { conflict, notFound } from "../http";

export async function getSettings(db: Db, userId: string) {
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (s) return s;
  const [created] = await db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(userSettings).where(eq(userSettings.userId, userId)))[0];
}

/** All entries of a user in the shape the exercise generator needs. */
export async function loadEntryPool(db: Db, userId: string, ids?: string[]): Promise<EntryLite[]> {
  const where = ids ? and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, ids)) : eq(vocabEntries.userId, userId);
  const rows = await db.select().from(vocabEntries).where(where);
  if (!rows.length) return [];
  const rowIds = rows.map((r) => r.id);
  const [examples, memberships] = await Promise.all([
    db.select({ entryId: vocabExamples.entryId, text: vocabExamples.text }).from(vocabExamples)
      .where(and(eq(vocabExamples.userId, userId), inArray(vocabExamples.entryId, rowIds))),
    db.select({ entryId: topicMemberships.entryId, topicId: topicMemberships.topicId }).from(topicMemberships)
      .where(and(eq(topicMemberships.userId, userId), inArray(topicMemberships.entryId, rowIds))),
  ]);
  const ex = new Map<string, string[]>();
  for (const e of examples) ex.set(e.entryId, [...(ex.get(e.entryId) ?? []), e.text]);
  const tp = new Map<string, string[]>();
  for (const m of memberships) tp.set(m.entryId, [...(tp.get(m.entryId) ?? []), m.topicId]);
  return rows.map((r) => ({
    id: r.id, headword: r.headword, partOfSpeech: r.partOfSpeech, translationDe: r.translationDe, definitionEn: r.definitionEn,
    register: r.register, collocations: r.collocations, synonyms: r.synonyms, antonyms: r.antonyms, wordFamily: r.wordFamily,
    confusables: r.confusables, acceptedAnswers: r.acceptedAnswers, examples: ex.get(r.id) ?? [], topicIds: tp.get(r.id) ?? [],
  }));
}

async function loadStates(db: Db, userId: string) {
  const rows = await db.select().from(learningStates).where(eq(learningStates.userId, userId));
  return new Map(rows.map((r) => [r.entryId, r]));
}

function toQueueState(r: typeof learningStates.$inferSelect, topicIds: string[]): QueueState {
  return {
    entryId: r.entryId, due: r.due, state: r.state, reps: r.reps, lapses: r.lapses, stability: r.stability,
    lastReview: r.lastReview, mastery: r.mastery, markedDifficult: r.markedDifficult, topicIds, introduced: !!r.introducedAt,
  };
}

export async function dayCounters(db: Db, userId: string, now: Date, tz: string) {
  const start = startOfLocalDay(now, tz);
  const [row] = await db
    .select({
      introducedToday: sql<number>`count(*) filter (where ${learningStates.introducedAt} >= ${start})::int`,
    })
    .from(learningStates)
    .where(eq(learningStates.userId, userId));
  const [ev] = await db
    .select({
      scheduledToday: sql<number>`count(*) filter (where ${reviewEvents.countedForSchedule})::int`,
      attemptsToday: sql<number>`count(*)::int`,
    })
    .from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), gte(reviewEvents.reviewedAt, start), isNull(reviewEvents.undoneAt)));
  return { introducedToday: row?.introducedToday ?? 0, scheduledToday: ev?.scheduledToday ?? 0, attemptsToday: ev?.attemptsToday ?? 0 };
}

export const sessionRequestSchema = z.object({
  mode: z.enum(["review", "focused", "mixed", "practice"]).default("mixed"),
  topicId: z.string().uuid().nullish(),
  minutes: z.number().int().min(2).max(120).optional(),
  kinds: z.array(z.string()).max(20).optional(),
  entryIds: z.array(z.string().uuid()).max(200).optional(),
  seed: z.string().max(64).optional(),
  /** Mixed Challenge: attach one variant per difficulty tier so the runner can adapt. */
  adaptive: z.boolean().optional(),
});

export type SessionCard = {
  exercise: Exercise;
  reason: QueueReason | "selected";
  schedule: boolean;
  intervals: Record<number, string> | null;
  /** Different exercise kinds for in-session retries after a miss (in order). */
  retries: Exercise[];
  /** Adaptive sessions only: one exercise per difficulty tier, easiest first. */
  variants?: Exercise[];
};

/**
 * Topics relevant to the exam: the target topics the learner chose in Settings,
 * plus topics whose names match the topic labels of their uploaded exam
 * materials (and their subtopics). null = none, so every word counts.
 */
async function examTopicIds(db: Db, userId: string, targetTopicIds: string[] = []): Promise<string[] | null> {
  const [materials, rows] = await Promise.all([
    db.select({ labels: examMaterials.labels }).from(examMaterials).where(eq(examMaterials.userId, userId)),
    db.select({ id: topics.id, name: topics.name, parentId: topics.parentId }).from(topics).where(eq(topics.userId, userId)),
  ]);
  const wanted = new Set(materials.flatMap((m) => m.labels.topic ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const own = new Set(rows.map((t) => t.id));
  const matched = new Set([...rows.filter((t) => wanted.has(t.name.trim().toLowerCase())).map((t) => t.id), ...targetTopicIds.filter((id) => own.has(id))]);
  // Subtopics of a matched topic belong to it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of rows) {
      if (t.parentId && matched.has(t.parentId) && !matched.has(t.id)) {
        matched.add(t.id);
        grew = true;
      }
    }
  }
  return matched.size ? [...matched] : null;
}

/** Build a study session: queue + one exercise per card. */
export async function buildSession(db: Db, userId: string, input: z.input<typeof sessionRequestSchema>, now = new Date()) {
  const req = sessionRequestSchema.parse(input);
  const settings = await getSettings(db, userId);
  const [pool, states] = await Promise.all([loadEntryPool(db, userId), loadStates(db, userId)]);
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const counters = await dayCounters(db, userId, now, settings.timezone);
  const scheduler = makeScheduler(settings.requestRetention);
  let queue: { entryId: string; reason: QueueReason | "selected"; schedule: boolean }[];
  let meta = { dueTotal: 0, overdueTotal: 0, deferred: 0, newAvailable: 0 };
  if (req.entryIds?.length) {
    queue = req.entryIds.filter((id) => poolById.has(id)).map((entryId) => ({ entryId, reason: "selected" as const, schedule: false }));
  } else {
    // Near the exam, exam-relevant words get more of the extra practice; target topics are always preferred there.
    const examFocus = req.mode !== "review" && (examPrepActive(settings.examDate, now) || settings.targetTopicIds.length > 0)
      ? { topicIds: await examTopicIds(db, userId, settings.targetTopicIds) }
      : null;
    const qs = [...states.values()].filter((s) => poolById.has(s.entryId)).map((s) => toQueueState(s, poolById.get(s.entryId)!.topicIds ?? []));
    const result = buildQueue(qs, {
      now,
      endOfDay: endOfLocalDay(now, settings.timezone),
      minutes: req.minutes ?? settings.sessionMinutes,
      newLimitRemaining: Math.max(0, settings.dailyNewLimit - counters.introducedToday),
      reviewLimitRemaining: Math.max(0, settings.dailyReviewLimit - counters.scheduledToday),
      mode: req.mode,
      topicId: req.topicId,
      examFocus,
    });
    queue = result.items;
    meta = { dueTotal: result.dueTotal, overdueTotal: result.overdueTotal, deferred: result.deferred, newAvailable: result.newAvailable };
  }
  const seed = req.seed ?? now.toISOString().slice(0, 13);
  const allowed = req.kinds?.length ? (req.kinds as ExerciseKind[]) : undefined;
  const cards: SessionCard[] = [];
  for (const item of queue) {
    const entry = poolById.get(item.entryId)!;
    const st = states.get(item.entryId);
    const ex = allowed?.length === 1
      ? generateExercise(allowed[0], entry, pool, seed)
      : chooseKind(entry, pool, {
          reps: st?.reps ?? 0, lapses: st?.lapses ?? 0, stability: st?.stability ?? 0, mastery: st?.mastery ?? {},
          overconfidence: st?.overconfidence ?? 0, difficult: st?.markedDifficult ?? false,
        }, seed, allowed);
    if (!ex) continue;
    let intervals: Record<number, string> | null = null;
    if (item.schedule && st) {
      const p = previewIntervals(rowToScheduling(st), now, scheduler);
      intervals = Object.fromEntries(Object.entries(p).map(([k, d]) => [k, formatInterval(now, d)]));
    }
    cards.push({
      exercise: ex, reason: item.reason, schedule: item.schedule, intervals,
      retries: retryExercises(ex, entry, pool, seed, allowed),
      ...(req.adaptive ? { variants: adaptiveVariants(entry, pool, seed, allowed) } : {}),
    });
  }
  return { cards, meta: { ...meta, ...counters, minutes: req.minutes ?? settings.sessionMinutes } };
}

function rowToScheduling(r: typeof learningStates.$inferSelect): SchedulingState {
  return {
    due: r.due, stability: r.stability, difficulty: r.difficulty, scheduledDays: r.scheduledDays, learningSteps: r.learningSteps,
    reps: r.reps, lapses: r.lapses, state: r.state, lastReview: r.lastReview,
  };
}

// ---------------------------------------------------------------- recording reviews

export const reviewEventSchema = z.object({
  clientEventId: z.string().min(8).max(80),
  entryId: z.string().uuid(),
  sessionId: z.string().uuid().nullish(),
  exerciseKind: z.string().max(40),
  dimension: z.enum(["recognition", "meaning", "spelling", "collocation", "grammar", "context", "production", "writing"]),
  outcome: z.enum(["correct", "alternative", "typo", "partial", "wrong", "revealed"]),
  independent: z.boolean(),
  recognitionOnly: z.boolean(),
  hintsUsed: z.number().int().min(0).max(10).default(0),
  selfRating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullish(),
  latencyMs: z.number().int().min(0).max(3_600_000).nullish(),
  answer: z.string().max(300).nullish(),
  schedule: z.boolean(),
  /** Partial-credit score for production tasks (0..1), from AI or self-check. */
  score: z.number().min(0).max(1).nullish(),
  reviewedAt: z.string().datetime(),
});
export type ReviewEventInput = z.infer<typeof reviewEventSchema>;

export type ReviewResult = {
  clientEventId: string;
  duplicate: boolean;
  rating: number;
  reason: string;
  counted: boolean;
  late: boolean;
  nextDue: string | null;
  mastery: MasteryMap;
};

const SUCCESS: Record<ReviewEventInput["outcome"], number> = {
  correct: 1, alternative: 0.7, typo: 0.6, partial: 0.4, wrong: 0, revealed: 0,
};

export async function recordReview(db: Db, userId: string, input: ReviewEventInput): Promise<ReviewResult> {
  const ev = reviewEventSchema.parse(input);
  const reviewedAt = new Date(ev.reviewedAt);
  if (reviewedAt.getTime() > Date.now() + 5 * 60000) throw conflict("Review time is in the future; check the device clock");
  const settings = await getSettings(db, userId);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(reviewEvents)
      .where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.clientEventId, ev.clientEventId)));
    if (existing) {
      const [st] = await tx.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, existing.entryId)));
      return {
        clientEventId: ev.clientEventId, duplicate: true, rating: existing.rating, reason: "already recorded",
        counted: existing.countedForSchedule, late: existing.late, nextDue: existing.nextDue?.toISOString() ?? null, mastery: st?.mastery ?? {},
      };
    }
    const [entry] = await tx.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.id, ev.entryId)));
    if (!entry) throw notFound("Word not found");
    let [st] = await tx.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, ev.entryId))).for("update");
    if (!st) {
      [st] = await tx.insert(learningStates).values({ userId, entryId: ev.entryId, due: reviewedAt }).returning();
    }
    const { rating, overconfident, reason } = deriveRating({
      outcome: ev.outcome,
      independent: ev.independent,
      recognitionOnly: ev.recognitionOnly,
      hintsUsed: ev.hintsUsed,
      selfRating: ev.selfRating ?? undefined,
      latencyMs: ev.latencyMs ?? undefined,
      overconfidence: st.overconfidence,
    });
    // An event older than the last scheduled review (e.g. synced late from another device)
    // still counts as practice evidence, but never rewinds the schedule.
    const late = !!st.lastReview && reviewedAt.getTime() < st.lastReview.getTime();
    const counted = ev.schedule && !late;
    const prevState = { ...st, due: st.due.toISOString(), lastReview: st.lastReview?.toISOString() ?? null, introducedAt: st.introducedAt?.toISOString() ?? null, updatedAt: undefined };
    let next = rowToScheduling(st);
    if (counted) {
      if (st.state === State.New && !st.lastReview) next = newSchedulingState(reviewedAt);
      next = schedule(next, rating, reviewedAt, makeScheduler(settings.requestRetention));
    }
    const success = ev.score ?? SUCCESS[ev.outcome];
    const mastery = applyEvidence(st.mastery, evidenceFor({ kind: ev.exerciseKind as ExerciseKind, dimension: ev.dimension }, success), reviewedAt);
    await tx.update(learningStates).set({
      ...(counted ? next : {}),
      introducedAt: st.introducedAt ?? reviewedAt,
      mastery,
      overconfidence: st.overconfidence + (overconfident ? 1 : 0),
      version: st.version + 1,
      updatedAt: new Date(),
    }).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, ev.entryId)));
    await tx.insert(reviewEvents).values({
      userId, entryId: ev.entryId, clientEventId: ev.clientEventId, sessionId: ev.sessionId ?? null, exerciseKind: ev.exerciseKind,
      dimension: ev.dimension, outcome: ev.outcome, rating, selfRating: ev.selfRating ?? null, hintsUsed: ev.hintsUsed,
      independent: ev.independent, latencyMs: ev.latencyMs ?? null, answer: ev.answer?.slice(0, 300) ?? null,
      countedForSchedule: counted, late, prevState, nextDue: counted ? next.due : null, reviewedAt,
    });
    return {
      clientEventId: ev.clientEventId, duplicate: false, rating, reason, counted, late,
      nextDue: counted ? next.due.toISOString() : st.due.toISOString(), mastery,
    };
  });
}

/** Undo the most recent review of a word (only the latest one, to keep history consistent). */
export async function undoReview(db: Db, userId: string, clientEventId: string) {
  return db.transaction(async (tx) => {
    const [ev] = await tx.select().from(reviewEvents).where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.clientEventId, clientEventId)));
    if (!ev) throw notFound("Review not found");
    if (ev.undoneAt) return { undone: true, alreadyUndone: true };
    const [latest] = await tx.select({ id: reviewEvents.id }).from(reviewEvents)
      .where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.entryId, ev.entryId), isNull(reviewEvents.undoneAt)))
      .orderBy(desc(reviewEvents.createdAt)).limit(1);
    if (latest?.id !== ev.id) throw conflict("Only the most recent answer for a word can be undone");
    const p = ev.prevState as Record<string, unknown> | null;
    if (p) {
      await tx.update(learningStates).set({
        due: new Date(p.due as string), stability: p.stability as number, difficulty: p.difficulty as number,
        scheduledDays: p.scheduledDays as number, learningSteps: p.learningSteps as number, reps: p.reps as number,
        lapses: p.lapses as number, state: p.state as number,
        lastReview: p.lastReview ? new Date(p.lastReview as string) : null,
        introducedAt: p.introducedAt ? new Date(p.introducedAt as string) : null,
        mastery: p.mastery as MasteryMap, overconfidence: p.overconfidence as number, updatedAt: new Date(),
      }).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, ev.entryId)));
    }
    await tx.update(reviewEvents).set({ undoneAt: new Date() }).where(eq(reviewEvents.id, ev.id));
    return { undone: true, alreadyUndone: false };
  });
}

export async function markDifficult(db: Db, userId: string, entryId: string, difficult: boolean) {
  const res = await db.update(learningStates).set({ markedDifficult: difficult, updatedAt: new Date() })
    .where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, entryId))).returning();
  if (!res.length) throw notFound("Word not found");
  return res[0];
}

/** Record that a word was used in independent writing (from Writing Lab analysis). */
export async function recordWritingUse(db: Db, userId: string, entryId: string, success: number, at = new Date()) {
  const [st] = await db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, entryId)));
  if (!st) return;
  await db.update(learningStates).set({ mastery: applyEvidence(st.mastery, { writing: success, production: success }, at), updatedAt: new Date() })
    .where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, entryId)));
}

export async function startStudySession(db: Db, userId: string, mode: string, topicId: string | null, minutes: number | null) {
  const [s] = await db.insert(studySessions).values({ userId, mode, topicId, plannedMinutes: minutes }).returning();
  return s;
}

export async function endStudySession(db: Db, userId: string, id: string, stats: Record<string, number>) {
  const [s] = await db.update(studySessions).set({ endedAt: new Date(), stats })
    .where(and(eq(studySessions.userId, userId), eq(studySessions.id, id))).returning();
  if (!s) throw notFound("Session not found");
  return s;
}
