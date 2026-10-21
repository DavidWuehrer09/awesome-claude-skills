import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { learnerSkills, reminderDeliveries, userSettings, writingErrorPatterns } from "@/db/schema";
import { loadSample } from "@/server/repos/account";
import { recordReview } from "@/server/repos/learning";
import { activityTrend, dismissPattern, learnerProfile, startOfLocalWeek, targetTopicProgress, weeklyPlan, weeklySummary } from "@/server/repos/planning";
import { topicTree } from "@/server/repos/vocab";
import { runReminderJob } from "@/server/notifications";
import { freshDb, twoUsers } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let u: Awaited<ReturnType<typeof twoUsers>>;
const DAY = 86400000;

const ev = (entryId: string, at: Date, outcome: "correct" | "wrong" = "correct") => ({
  clientEventId: `evt-${Math.random().toString(36).slice(2)}`, entryId, exerciseKind: "typed_de_en", dimension: "spelling" as const,
  outcome, independent: true, recognitionOnly: false, hintsUsed: 0, schedule: false, reviewedAt: at.toISOString(), latencyMs: 30000,
});

beforeAll(async () => {
  ({ db, close } = await freshDb());
  u = await twoUsers(db);
  await loadSample(db, u.alice.id);
});
afterAll(() => close());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function sampleEntryIds() {
  const tree = await topicTree(db, u.alice.id);
  return { tree };
}

describe("study planning", () => {
  it("starts the week on Monday in the learner's time zone", () => {
    // Sunday 2026-10-25 23:30 in Berlin is still the week of Monday 2026-10-19.
    const start = startOfLocalWeek(new Date("2026-10-25T22:30:00Z"), "Europe/Berlin");
    expect(start.toISOString()).toBe("2026-10-18T22:00:00.000Z");
  });

  it("counts study days against the intensity target and tracks target topics", async () => {
    const { tree } = await sampleEntryIds();
    const words = await db.query.vocabEntries.findMany({ where: (v, { eq: e }) => e(v.userId, u.alice.id), limit: 3 });
    const now = new Date();
    await recordReview(db, u.alice.id, ev(words[0].id, now));
    await recordReview(db, u.alice.id, ev(words[1].id, now, "wrong"));
    const leaf = tree.flatMap((t) => [t, ...t.children]).find((t) => t.count > 0)!;
    await db.update(userSettings).set({ studyIntensity: "light", targetTopicIds: [leaf.id] }).where(eq(userSettings.userId, u.alice.id));
    const plan = await weeklyPlan(db, u.alice.id, now);
    expect(plan).toMatchObject({ targetDays: 3, studyDays: 1, studiedToday: true, reviews: 2 });
    expect(plan.targets[0]).toMatchObject({ id: leaf.id, words: leaf.count });
    expect(await targetTopicProgress(db, u.bob.id, [leaf.id])).toEqual([]); // other users' topics are invisible
  });

  it("summarises the last seven days and compares with the week before", async () => {
    const words = await db.query.vocabEntries.findMany({ where: (v, { eq: e }) => e(v.userId, u.alice.id), limit: 2 });
    await recordReview(db, u.alice.id, ev(words[0].id, new Date(Date.now() - 10 * DAY)));
    const s = await weeklySummary(db, u.alice.id);
    expect(s.reviews).toBe(2);
    expect(s.reviewsBefore).toBe(1);
    expect(s.accuracy).toBe(50);
    expect(s.hardestWords.map((h) => h.id)).toEqual([words[1].id]);
  });

  it("groups activity into weeks for longer trends", async () => {
    const weeks = await activityTrend(db, u.alice.id, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.reduce((n, w) => n + w.reviews, 0)).toBe(3);
    expect(weeks[3].reviews).toBe(2);
  });
});

describe("learner profile", () => {
  it("is built from evidence, saved for the tutor, and can be corrected", async () => {
    await db.insert(writingErrorPatterns).values({ userId: u.alice.id, category: "articles", occurrences: 3, submissionsAffected: 2, examples: ["the society"] });
    const p = await learnerProfile(db, u.alice.id);
    expect(p.words.total).toBeGreaterThan(0);
    expect(p.vocabulary.find((v) => v.key === "spelling")?.evidence).toBeGreaterThan(0);
    expect(p.writing).toEqual([]); // no real writing assessment yet: nothing is guessed
    expect(p.patterns.map((x) => x.category)).toEqual(["articles"]);
    const saved = await db.select().from(learnerSkills).where(eq(learnerSkills.userId, u.alice.id));
    expect(saved.some((r) => r.skill === "vocab:spelling")).toBe(true);
    expect(await dismissPattern(db, u.alice.id, "articles")).toEqual({ removed: 1 });
    expect((await learnerProfile(db, u.alice.id)).patterns).toEqual([]);
    expect(await dismissPattern(db, u.bob.id, "articles")).toEqual({ removed: 0 });
  });
});

describe("weekly summary e-mail", () => {
  it("is sent once on Sunday after the reminder time, only to learners who opted in", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
    vi.stubEnv("EMAIL_FROM", "Academy <reminders@example.com>");
    vi.stubEnv("APP_SECRET", "x".repeat(40));
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await db.update(userSettings).set({ onboarded: true, weeklySummaryEmail: true, reminderTime: "17:30", timezone: "Europe/Berlin" }).where(eq(userSettings.userId, u.alice.id));
    const sundayEvening = new Date("2026-10-25T17:00:00Z"); // 18:00 in Berlin
    const first = await runReminderJob(db, sundayEvening);
    const second = await runReminderJob(db, sundayEvening);
    expect(first.filter((r) => r.channel === "weekly")).toEqual([{ userId: u.alice.id, channel: "weekly", status: "sent" }]);
    expect(second.filter((r) => r.channel === "weekly")).toEqual([]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.subject).toBe("Your week in English Academy");
    expect(body.text).toMatch(/Unsubscribe: /);
    const monday = await runReminderJob(db, new Date("2026-10-26T17:00:00Z"));
    expect(monday.filter((r) => r.channel === "weekly")).toEqual([]);
    expect((await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.channel, "weekly"))).length).toBe(1);
  });
});
