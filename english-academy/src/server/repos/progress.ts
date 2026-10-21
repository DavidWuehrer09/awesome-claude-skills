import "server-only";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  learningStates,
  recommendationStates,
  reviewEvents,
  studySessions,
  topicMemberships,
  topics,
  vocabEntries,
  writingAssessments,
  writingErrorPatterns,
  writingSubmissions,
} from "@/db/schema";
import { masteryLevel, overallMastery, type MasteryLevel } from "@/domain/learning/mastery";
import { makeScheduler, retrievability } from "@/domain/learning/scheduler";
import { CURRICULUM, drillHref } from "@/domain/writing/rubrics";
import { endOfLocalDay, localDateString, startOfLocalDay } from "@/lib/time";
import { getSettings } from "./learning";

const RECOGNITION_KINDS = ["meaning_choice", "synonym_choice", "antonym_choice", "nuance", "flip_en_de", "flip_de_en"];

export async function dashboardCounts(db: Db, userId: string, now = new Date()) {
  const settings = await getSettings(db, userId);
  const eod = endOfLocalDay(now, settings.timezone);
  const sod = startOfLocalDay(now, settings.timezone);
  const [row] = await db.select({
    total: sql<number>`count(*)::int`,
    newCount: sql<number>`count(*) filter (where ${learningStates.state} = 0)::int`,
    dueToday: sql<number>`count(*) filter (where ${learningStates.state} <> 0 and ${learningStates.due} < ${eod})::int`,
    overdue: sql<number>`count(*) filter (where ${learningStates.state} <> 0 and ${learningStates.due} <= ${now})::int`,
    introducedToday: sql<number>`count(*) filter (where ${learningStates.introducedAt} >= ${sod})::int`,
  }).from(learningStates).where(eq(learningStates.userId, userId));
  const [today] = await db.select({ n: sql<number>`count(*)::int` }).from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), gte(reviewEvents.reviewedAt, sod), isNull(reviewEvents.undoneAt)));
  const newAvailable = Math.max(0, Math.min(row.newCount, settings.dailyNewLimit - row.introducedToday));
  const reviewMinutes = Math.ceil(((row.dueToday + newAvailable) * 20) / 60);
  return { ...row, reviewedToday: today.n, newAvailable, estimatedMinutes: reviewMinutes, settings };
}

export async function streak(db: Db, userId: string, tz: string, now = new Date()) {
  const rows = await db.select({ at: reviewEvents.reviewedAt }).from(reviewEvents)
    .where(and(eq(reviewEvents.userId, userId), gte(reviewEvents.reviewedAt, new Date(now.getTime() - 400 * 86400000)), isNull(reviewEvents.undoneAt)));
  const days = new Set(rows.map((r) => localDateString(r.at, tz)));
  let n = 0;
  const cursor = new Date(now);
  if (!days.has(localDateString(cursor, tz))) cursor.setTime(cursor.getTime() - 86400000); // today not done yet: count from yesterday
  while (days.has(localDateString(cursor, tz))) {
    n++;
    cursor.setTime(cursor.getTime() - 86400000);
  }
  return n;
}

export async function progressReport(db: Db, userId: string, now = new Date()) {
  const settings = await getSettings(db, userId);
  const since = new Date(now.getTime() - 28 * 86400000);
  const states = await db.select().from(learningStates).where(eq(learningStates.userId, userId));
  const scheduler = makeScheduler(settings.requestRetention);
  const levels: Record<MasteryLevel, number> = { new: 0, learning: 0, recognised: 0, recalled: 0, productive: 0, mastered: 0 };
  let retSum = 0;
  let retN = 0;
  let weakProduction = 0;
  let writingTransfer = 0;
  for (const s of states) {
    levels[masteryLevel(s.mastery, s.stability)]++;
    const r = retrievability({ ...s }, now, scheduler);
    if (r !== null) {
      retSum += r;
      retN++;
    }
    if (s.introducedAt && s.stability > 7 && (s.mastery.production?.score ?? 0) < 0.6) weakProduction++;
    if ((s.mastery.writing?.score ?? 0) >= 0.6) writingTransfer++;
  }
  const events = await db.select({
    at: reviewEvents.reviewedAt, outcome: reviewEvents.outcome, kind: reviewEvents.exerciseKind, dimension: reviewEvents.dimension,
    independent: reviewEvents.independent, latency: reviewEvents.latencyMs, entryId: reviewEvents.entryId,
  }).from(reviewEvents).where(and(eq(reviewEvents.userId, userId), gte(reviewEvents.reviewedAt, since), isNull(reviewEvents.undoneAt)));
  const ok = (o: string) => o === "correct" || o === "alternative" || o === "typo";
  const rate = (list: typeof events) => (list.length ? Math.round((list.filter((e) => ok(e.outcome)).length / list.length) * 100) : null);
  const independentEvents = events.filter((e) => e.independent && !RECOGNITION_KINDS.includes(e.kind));
  const daily = new Map<string, { reviews: number; correct: number }>();
  for (let i = 27; i >= 0; i--) daily.set(localDateString(new Date(now.getTime() - i * 86400000), settings.timezone), { reviews: 0, correct: 0 });
  for (const e of events) {
    const d = daily.get(localDateString(e.at, settings.timezone));
    if (d) {
      d.reviews++;
      if (ok(e.outcome)) d.correct++;
    }
  }
  const sessions = await db.select({ started: studySessions.startedAt, ended: studySessions.endedAt }).from(studySessions)
    .where(and(eq(studySessions.userId, userId), gte(studySessions.startedAt, since)));
  const studyMinutes = Math.round(sessions.reduce((acc, s) => acc + (s.ended ? Math.min(90, (s.ended.getTime() - s.started.getTime()) / 60000) : 0), 0));

  const topicRows = await db.select({
    topicId: topics.id, name: topics.name, entryId: topicMemberships.entryId,
  }).from(topicMemberships).innerJoin(topics, eq(topics.id, topicMemberships.topicId)).where(eq(topicMemberships.userId, userId));
  const stateById = new Map(states.map((s) => [s.entryId, s]));
  const evByEntry = new Map<string, typeof events>();
  for (const e of events) evByEntry.set(e.entryId, [...(evByEntry.get(e.entryId) ?? []), e]);
  const topicStats = new Map<string, { name: string; words: number; mastery: number; ev: typeof events }>();
  for (const r of topicRows) {
    const t = topicStats.get(r.topicId) ?? { name: r.name, words: 0, mastery: 0, ev: [] };
    t.words++;
    t.mastery += overallMastery(stateById.get(r.entryId)?.mastery ?? {});
    t.ev.push(...(evByEntry.get(r.entryId) ?? []));
    topicStats.set(r.topicId, t);
  }
  const byTopic = [...topicStats.entries()].map(([id, t]) => ({
    id, name: t.name, words: t.words, mastery: Math.round((t.mastery / Math.max(1, t.words)) * 100), accuracy: rate(t.ev), attempts: t.ev.length,
  })).sort((a, b) => b.words - a.words);

  const assessments = await db.select({ at: writingAssessments.completedAt, result: writingAssessments.result, isDemo: writingAssessments.isDemo })
    .from(writingAssessments).where(and(eq(writingAssessments.userId, userId), eq(writingAssessments.status, "complete"), eq(writingAssessments.isDemo, false)))
    .orderBy(writingAssessments.completedAt);
  const LEVEL_SCORE: Record<string, number> = { weak: 1, developing: 2, solid: 3, strong: 4, excellent: 5 };
  const writingTrend = assessments.map((a) => {
    const dims = (a.result?.dimensions as { key: string; level: string }[] | undefined) ?? [];
    const est = a.result?.estimate as { low: number; high: number } | null | undefined;
    return {
      at: a.at?.toISOString() ?? "",
      dims: Object.fromEntries(dims.filter((d) => LEVEL_SCORE[d.level]).map((d) => [d.key, LEVEL_SCORE[d.level]])),
      estimate: est ? { low: est.low, high: est.high } : null,
    };
  });
  const patterns = await db.select().from(writingErrorPatterns).where(eq(writingErrorPatterns.userId, userId)).orderBy(desc(writingErrorPatterns.submissionsAffected));

  return {
    observed: {
      totalWords: states.length,
      introduced: states.filter((s) => s.introducedAt).length,
      attempts28d: events.length,
      accuracy28d: rate(events),
      independentAccuracy28d: rate(independentEvents),
      collocationAccuracy28d: rate(events.filter((e) => e.dimension === "collocation")),
      productionAttempts28d: events.filter((e) => e.dimension === "production").length,
      studyMinutes28d: studyMinutes,
      writingTransferWords: writingTransfer,
      weakProductionWords: weakProduction,
      submissions: (await db.select({ n: sql<number>`count(*)::int` }).from(writingSubmissions).where(eq(writingSubmissions.userId, userId)))[0].n,
    },
    estimates: {
      retention: retN ? Math.round((retSum / retN) * 100) : null,
      levels,
    },
    daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
    byTopic,
    writingTrend,
    patterns: patterns.map((p) => ({ ...p, label: CURRICULUM[p.category]?.label ?? p.category, practice: CURRICULUM[p.category]?.practice ?? "", drillHref: drillHref(p.category) })),
    streak: settings.showStreak ? await streak(db, userId, settings.timezone, now) : null,
    explanations: {
      accuracy28d: "Share of answers in the last 28 days that were correct, a valid alternative, or correct apart from a small spelling slip.",
      independentAccuracy28d: "Same, but only typed or written answers without options or self-grading: the best measure of real recall.",
      retention: "Estimate: average predicted probability (FSRS) that you would recall each studied word right now.",
      levels: "Estimate from separate skill measurements. 'Mastered' requires recall, active production, use in writing and long-term stability; recognition alone never counts.",
      writingTransferWords: "Words whose use in your submitted writing was judged correct or mostly correct.",
      weakProductionWords: "Words you recall reliably (stable for 7+ days) but have not yet produced well in sentences.",
      studyMinutes28d: "Time in completed study sessions (each capped at 90 minutes).",
    },
  };
}

// ---------------------------------------------------------------- recommendations

export type Recommendation = { key: string; title: string; detail: string; href: string; kind: "review" | "practice" | "writing" | "abitur" };

export async function recommendations(db: Db, userId: string, now = new Date()): Promise<Recommendation[]> {
  const counts = await dashboardCounts(db, userId, now);
  const recs: Recommendation[] = [];
  if (counts.overdue > 0 || counts.dueToday > 0) {
    recs.push({ key: "due", title: `Review ${counts.dueToday} word${counts.dueToday === 1 ? "" : "s"} due today`, detail: counts.overdue ? `${counts.overdue} are overdue; they come first.` : "Keeping up keeps sessions short.", href: "/learn/session?mode=review", kind: "review" });
  }
  const leeches = await db.select({ id: learningStates.entryId }).from(learningStates).where(and(eq(learningStates.userId, userId), gte(learningStates.lapses, 3)));
  if (leeches.length) {
    recs.push({ key: "leeches", title: `Work on the ${leeches.length} word${leeches.length === 1 ? "" : "s"} you keep forgetting`, detail: "A mix of typed recall, context and your own sentences.", href: "/learn/session?mode=practice&list=forgotten", kind: "practice" });
  }
  const stable = await db.select({ entryId: learningStates.entryId, mastery: learningStates.mastery, headword: vocabEntries.headword })
    .from(learningStates).innerJoin(vocabEntries, eq(vocabEntries.id, learningStates.entryId))
    .where(and(eq(learningStates.userId, userId), gte(learningStates.stability, 7)));
  const notWritten = stable.filter((s) => !(s.mastery.writing?.n));
  if (notWritten.length >= 4) {
    recs.push({ key: "write-transfer", title: `Write a paragraph using ${Math.min(5, notWritten.length)} words you know well`, detail: notWritten.slice(0, 5).map((s) => s.headword).join(", "), href: `/writing/new?section=vocab_context&words=${notWritten.slice(0, 5).map((s) => s.entryId).join(",")}`, kind: "writing" });
  }
  const weakCol = stable.filter((s) => (s.mastery.collocation?.n ?? 0) > 0 && (s.mastery.collocation?.score ?? 1) < 0.6);
  if (weakCol.length >= 3) {
    recs.push({ key: "collocations", title: "Practise collocations", detail: `${weakCol.length} familiar words still have weak collocations.`, href: "/practice/collocation", kind: "practice" });
  }
  const due = await db.select().from(writingErrorPatterns).where(and(eq(writingErrorPatterns.userId, userId), lte(writingErrorPatterns.nextRevisit, now), gte(writingErrorPatterns.submissionsAffected, 2)));
  for (const p of due.slice(0, 2)) {
    recs.push({ key: `pattern-${p.category}`, title: `Revisit: ${CURRICULUM[p.category]?.label ?? p.category}`, detail: CURRICULUM[p.category]?.practice ?? "Targeted practice.", href: `/writing/new?section=sentence&focus=${p.category}`, kind: "writing" });
  }
  if (counts.newAvailable > 0) {
    recs.push({ key: "new", title: `Learn ${counts.newAvailable} new word${counts.newAvailable === 1 ? "" : "s"}`, detail: "Within today's limit for new words.", href: "/learn/session?mode=mixed", kind: "review" });
  }
  if (counts.settings.examDate) {
    const days = Math.round((new Date(counts.settings.examDate).getTime() - now.getTime()) / 86400000);
    if (days >= 0 && days <= 90) recs.push({ key: "abitur", title: `Exam in ${days} days: timed practice`, detail: "One timed Abitur-style task per week builds stamina.", href: "/abitur", kind: "abitur" });
  }
  const states = await db.select().from(recommendationStates).where(eq(recommendationStates.userId, userId));
  const hidden = new Set(states.filter((s) => s.status === "dismissed" || (s.status === "postponed" && s.until && s.until > now)).map((s) => s.key));
  return recs.filter((r) => !hidden.has(r.key)).slice(0, 5);
}

export async function setRecommendationState(db: Db, userId: string, key: string, status: "dismissed" | "postponed" | "done") {
  const until = status === "postponed" ? new Date(Date.now() + 86400000) : status === "done" ? new Date(Date.now() + 6 * 3600000) : null;
  const finalStatus = status === "done" ? "postponed" : status;
  await db.insert(recommendationStates).values({ userId, key, status: finalStatus, until })
    .onConflictDoUpdate({ target: [recommendationStates.userId, recommendationStates.key], set: { status: finalStatus, until, updatedAt: new Date() } });
}

export async function topicMasterySummary(db: Db, userId: string) {
  const rows = await db.select({ topicId: topics.id, name: topics.name, parentId: topics.parentId, mastery: learningStates.mastery })
    .from(topics)
    .leftJoin(topicMemberships, eq(topicMemberships.topicId, topics.id))
    .leftJoin(learningStates, and(eq(learningStates.entryId, topicMemberships.entryId), eq(learningStates.userId, userId)))
    .where(eq(topics.userId, userId));
  return rows;
}
