import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  examAssessments, examAttempts, learnerSkills, learningStates, reviewEvents, studySessions, topicMemberships, topics, vocabEntries,
  writingAssessments, writingErrorPatterns, writingSubmissions, type MasteryMap,
} from "@/db/schema";
import { DIMENSIONS, masteryLevel } from "@/domain/learning/mastery";
import { localDateString, localWeekday, zonedTimeToUtc } from "@/lib/time";
import { getSettings } from "./learning";

const DAY = 86400000;
const SUCCESS = new Set(["correct", "alternative", "typo"]);
/** Study days per week the plan aims for, by intensity. */
export const INTENSITY_DAYS = { light: 3, normal: 5, intensive: 6 } as const;

/** Monday 00:00 of the learner's local week (counted in calendar days, so DST changes cannot shift it). */
export function startOfLocalWeek(now: Date, tz: string) {
  const back = (localWeekday(now, tz) + 6) % 7; // 0 = Sunday in localWeekday
  const [y, m, d] = localDateString(now, tz).split("-").map(Number);
  const monday = new Date(Date.UTC(y, m - 1, d - back));
  return zonedTimeToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, tz);
}

async function reviewsSince(db: Db, userId: string, since: Date) {
  return db.select({ at: reviewEvents.reviewedAt, outcome: reviewEvents.outcome, latencyMs: reviewEvents.latencyMs, entryId: reviewEvents.entryId })
    .from(reviewEvents).where(and(eq(reviewEvents.userId, userId), gte(reviewEvents.reviewedAt, since), isNull(reviewEvents.undoneAt)));
}

const minutesOf = (rows: { latencyMs: number | null }[]) => Math.round(rows.reduce((n, r) => n + Math.min(r.latencyMs ?? 15000, 5 * 60000), 0) / 60000);

// ---------------------------------------------------------------- weekly plan (home)

export async function weeklyPlan(db: Db, userId: string, now = new Date()) {
  const s = await getSettings(db, userId);
  const tz = s.timezone;
  const weekStart = startOfLocalWeek(now, tz);
  const rows = await reviewsSince(db, userId, weekStart);
  const days = new Set(rows.map((r) => localDateString(r.at, tz)));
  const targetDays = INTENSITY_DAYS[(s.studyIntensity as keyof typeof INTENSITY_DAYS) ?? "normal"] ?? 5;
  const targets = s.targetTopicIds.length ? await targetTopicProgress(db, userId, s.targetTopicIds, now) : [];
  return {
    intensity: s.studyIntensity, targetDays, studyDays: days.size, studiedToday: days.has(localDateString(now, tz)),
    minutes: minutesOf(rows), reviews: rows.length, targetMinutesPerDay: s.sessionMinutes,
    preferredStudyTime: s.preferredStudyTime, examDate: s.examDate, targets,
  };
}

export async function targetTopicProgress(db: Db, userId: string, topicIds: string[], now = new Date()) {
  if (!topicIds.length) return [];
  const own = await db.select({ id: topics.id, name: topics.name }).from(topics).where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)));
  const members = await db.select({ topicId: topicMemberships.topicId, entryId: topicMemberships.entryId }).from(topicMemberships)
    .where(and(eq(topicMemberships.userId, userId), inArray(topicMemberships.topicId, own.map((t) => t.id))));
  const ids = [...new Set(members.map((m) => m.entryId))];
  const states = ids.length ? await db.select({ entryId: learningStates.entryId, mastery: learningStates.mastery, stability: learningStates.stability, due: learningStates.due, state: learningStates.state })
    .from(learningStates).where(and(eq(learningStates.userId, userId), inArray(learningStates.entryId, ids))) : [];
  const byEntry = new Map(states.map((st) => [st.entryId, st]));
  return own.map((t) => {
    const words = members.filter((m) => m.topicId === t.id).map((m) => byEntry.get(m.entryId));
    const levels = words.map((w) => (w ? masteryLevel(w.mastery as MasteryMap, w.stability) : "new"));
    return {
      id: t.id, name: t.name, words: words.length,
      productive: levels.filter((l) => l === "productive" || l === "mastered").length,
      notStarted: levels.filter((l) => l === "new").length,
      due: words.filter((w) => w && w.state !== 0 && w.due.getTime() <= now.getTime()).length,
    };
  });
}

// ---------------------------------------------------------------- weekly summary

export async function weeklySummary(db: Db, userId: string, now = new Date()) {
  const s = await getSettings(db, userId);
  const thisStart = new Date(now.getTime() - 7 * DAY);
  const prevStart = new Date(now.getTime() - 14 * DAY);
  const rows = await reviewsSince(db, userId, prevStart);
  const cur = rows.filter((r) => r.at >= thisStart);
  const prev = rows.filter((r) => r.at < thisStart);
  const acc = (list: typeof rows) => (list.length ? Math.round((list.filter((r) => SUCCESS.has(r.outcome)).length / list.length) * 100) : null);
  const [introduced] = await db.select({ n: sql<number>`count(*)::int` }).from(learningStates)
    .where(and(eq(learningStates.userId, userId), gte(learningStates.introducedAt, thisStart)));
  const [writing] = await db.select({ n: sql<number>`count(*)::int` }).from(writingSubmissions)
    .where(and(eq(writingSubmissions.userId, userId), gte(writingSubmissions.createdAt, thisStart)));
  const [examsDone] = await db.select({ n: sql<number>`count(*)::int` }).from(examAttempts)
    .where(and(eq(examAttempts.userId, userId), gte(examAttempts.submittedAt, thisStart)));
  // Words missed most often this week.
  const misses = new Map<string, number>();
  for (const r of cur) if (!SUCCESS.has(r.outcome)) misses.set(r.entryId, (misses.get(r.entryId) ?? 0) + 1);
  const topIds = [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const hard = topIds.length ? await db.select({ id: vocabEntries.id, headword: vocabEntries.headword }).from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, topIds))) : [];
  return {
    from: thisStart.toISOString(), to: now.toISOString(),
    reviews: cur.length, reviewsBefore: prev.length, accuracy: acc(cur), accuracyBefore: acc(prev),
    minutes: minutesOf(cur), studyDays: new Set(cur.map((r) => localDateString(r.at, s.timezone))).size,
    newWords: introduced.n, writingSubmissions: writing.n, examsSubmitted: examsDone.n,
    hardestWords: topIds.map((id) => hard.find((h) => h.id === id)).filter((h): h is { id: string; headword: string } => !!h),
  };
}

// ---------------------------------------------------------------- longer trends and session history

export async function activityTrend(db: Db, userId: string, weeks = 12, now = new Date()) {
  const s = await getSettings(db, userId);
  const first = startOfLocalWeek(new Date(now.getTime() - (weeks - 1) * 7 * DAY), s.timezone);
  const rows = await reviewsSince(db, userId, first);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(first.getTime() + i * 7 * DAY);
    return { week: localDateString(start, s.timezone), start, reviews: 0, correct: 0, ms: 0 };
  });
  for (const r of rows) {
    const i = Math.min(weeks - 1, Math.floor((r.at.getTime() - first.getTime()) / (7 * DAY)));
    if (i < 0) continue;
    buckets[i].reviews++;
    if (SUCCESS.has(r.outcome)) buckets[i].correct++;
    buckets[i].ms += Math.min(r.latencyMs ?? 15000, 5 * 60000);
  }
  return buckets.map((b) => ({ week: b.week, reviews: b.reviews, accuracy: b.reviews ? Math.round((b.correct / b.reviews) * 100) : null, minutes: Math.round(b.ms / 60000) }));
}

export async function sessionHistory(db: Db, userId: string, limit = 30) {
  return db.select({ id: studySessions.id, mode: studySessions.mode, startedAt: studySessions.startedAt, endedAt: studySessions.endedAt, plannedMinutes: studySessions.plannedMinutes, stats: studySessions.stats, topic: topics.name })
    .from(studySessions).leftJoin(topics, eq(topics.id, studySessions.topicId))
    .where(eq(studySessions.userId, userId)).orderBy(desc(studySessions.startedAt)).limit(limit);
}

// ---------------------------------------------------------------- learner profile

const WRITING_LEVEL: Record<string, number> = { excellent: 1, strong: 0.8, solid: 0.65, developing: 0.45, weak: 0.25 };

/**
 * What the app has learned about the learner, from evidence only: mastery per
 * dimension, writing dimensions from real (non-demo) assessments, recurring
 * error patterns. Saved to learner_skills so the tutor can use it (with consent).
 */
export async function learnerProfile(db: Db, userId: string) {
  const states = await db.select({ mastery: learningStates.mastery, stability: learningStates.stability, introducedAt: learningStates.introducedAt })
    .from(learningStates).where(eq(learningStates.userId, userId));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const levels = states.map((st) => masteryLevel(st.mastery as MasteryMap, st.stability));
  const vocabulary = DIMENSIONS.map((d) => {
    const seen = states.map((st) => (st.mastery as MasteryMap)[d.key]).filter((x) => x && x.n > 0);
    return { key: d.key, label: d.label, score: seen.length ? Math.round((seen.reduce((n, x) => n + x!.score, 0) / seen.length) * 100) / 100 : null, evidence: seen.length };
  });
  const assessments = await db.select({ result: writingAssessments.result }).from(writingAssessments)
    .where(and(eq(writingAssessments.userId, userId), eq(writingAssessments.status, "complete"), eq(writingAssessments.isDemo, false)))
    .orderBy(desc(writingAssessments.createdAt)).limit(8);
  const dims = new Map<string, number[]>();
  for (const a of assessments) {
    for (const d of ((a.result as { dimensions?: { key: string; level: string }[] } | null)?.dimensions ?? [])) {
      if (WRITING_LEVEL[d.level] === undefined) continue;
      dims.set(d.key, [...(dims.get(d.key) ?? []), WRITING_LEVEL[d.level]]);
    }
  }
  const writing = [...dims.entries()].map(([key, v]) => ({ key, score: Math.round((v.reduce((n, x) => n + x, 0) / v.length) * 100) / 100, evidence: v.length }));
  const patterns = await db.select().from(writingErrorPatterns).where(eq(writingErrorPatterns.userId, userId)).orderBy(desc(writingErrorPatterns.submissionsAffected));
  const [{ examsAssessed }] = await db.select({ examsAssessed: sql<number>`count(*)::int` }).from(examAssessments)
    .where(and(eq(examAssessments.userId, userId), eq(examAssessments.status, "complete"), eq(examAssessments.isDemo, false)));

  const rows = [
    { skill: "vocab:breadth", score: total ? levels.filter((l) => l === "productive" || l === "mastered").length / total : 0, evidence: total },
    ...vocabulary.filter((v) => v.score !== null).map((v) => ({ skill: `vocab:${v.key}`, score: v.score!, evidence: v.evidence })),
    ...writing.map((w) => ({ skill: `writing:${w.key}`, score: w.score, evidence: w.evidence })),
  ];
  for (const r of rows) {
    await db.insert(learnerSkills).values({ userId, ...r, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [learnerSkills.userId, learnerSkills.skill], set: { score: r.score, evidence: r.evidence, updatedAt: new Date() } });
  }
  return {
    words: { total, introduced: states.filter((st) => st.introducedAt).length, recalled: levels.filter((l) => ["recalled", "productive", "mastered"].includes(l)).length, productive: levels.filter((l) => l === "productive" || l === "mastered").length, mastered: levels.filter((l) => l === "mastered").length },
    vocabulary, writing, writingAssessments: assessments.length, examsAssessed,
    patterns: patterns.map((p) => ({ category: p.category, submissionsAffected: p.submissionsAffected, cleanSubmissions: p.cleanSubmissions, lastSeen: p.lastSeen, examples: p.examples.slice(0, 3) })),
  };
}

/** The learner corrects the profile: a pattern they no longer consider a problem is removed (it returns if it recurs). */
export async function dismissPattern(db: Db, userId: string, category: string) {
  const r = await db.delete(writingErrorPatterns).where(and(eq(writingErrorPatterns.userId, userId), eq(writingErrorPatterns.category, category))).returning({ category: writingErrorPatterns.category });
  return { removed: r.length };
}
