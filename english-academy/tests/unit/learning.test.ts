import { describe, expect, it } from "vitest";
import { checkAnswer, normalizeAnswer } from "@/domain/learning/answers";
import {
  adaptiveTier,
  adaptiveVariants,
  availableKinds,
  chooseKind,
  evidenceFor,
  generateExercise,
  germanMeaningAnswers,
  KIND_TIER,
  makeCloze,
  pickVariant,
  retryExercises,
  retryKinds,
  type EntryLite,
} from "@/domain/learning/exercises";
import { applyEvidence, masteryLevel } from "@/domain/learning/mastery";
import { deriveRating, makeScheduler, newSchedulingState, previewIntervals, Rating, schedule, State } from "@/domain/learning/scheduler";
import { buildQueue, examPrepActive, interleave, type QueueState } from "@/domain/learning/selection";

const T0 = new Date("2026-03-10T08:00:00Z");
const day = 86400000;

describe("FSRS scheduling", () => {
  it("grows intervals with successful independent recall and shrinks after a lapse", () => {
    const sch = makeScheduler(0.9);
    let s = newSchedulingState(T0);
    s = schedule(s, Rating.Good, T0, sch);
    const firstGap = s.due.getTime() - T0.getTime();
    let t = T0;
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      t = s.due;
      s = schedule(s, Rating.Good, t, sch);
      gaps.push(s.due.getTime() - t.getTime());
    }
    expect(gaps[4]).toBeGreaterThan(gaps[2]);
    expect(gaps[2]).toBeGreaterThan(firstGap);
    expect(s.state).toBe(State.Review);
    const before = s.stability;
    const lapsed = schedule(s, Rating.Again, s.due, sch);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(before);
    expect(lapsed.due.getTime() - s.due.getTime()).toBeLessThan(day);
  });

  it("is deterministic (no fuzz) and caps the interval so nothing leaves revision", () => {
    const run = () => {
      let s = newSchedulingState(T0);
      for (let i = 0; i < 30; i++) s = schedule(s, Rating.Easy, s.due, makeScheduler(0.9, 365));
      return s;
    };
    const a = run();
    expect(run().due.toISOString()).toBe(a.due.toISOString());
    expect(a.scheduledDays).toBeLessThanOrEqual(365);
  });

  it("previews orderly intervals per grade", () => {
    let s = newSchedulingState(T0);
    s = schedule(s, Rating.Good, T0);
    s = schedule(s, Rating.Good, s.due);
    const p = previewIntervals(s, s.due);
    expect(p[Rating.Again].getTime()).toBeLessThan(p[Rating.Hard].getTime());
    expect(p[Rating.Hard].getTime()).toBeLessThanOrEqual(p[Rating.Good].getTime());
    expect(p[Rating.Good].getTime()).toBeLessThan(p[Rating.Easy].getTime());
  });

  it("handles a review across the DST switch without errors", () => {
    let s = newSchedulingState(new Date("2026-03-28T20:00:00Z"));
    s = schedule(s, Rating.Good, new Date("2026-03-28T20:00:00Z"));
    s = schedule(s, Rating.Good, new Date("2026-03-29T01:30:00Z"));
    expect(Number.isFinite(s.due.getTime())).toBe(true);
  });
});

describe("deriveRating", () => {
  it("does not give recognition the same credit as independent recall", () => {
    expect(deriveRating({ outcome: "correct", independent: false, recognitionOnly: true, hintsUsed: 0, selfRating: Rating.Easy }).rating).toBe(Rating.Hard);
    expect(deriveRating({ outcome: "correct", independent: true, recognitionOnly: false, hintsUsed: 0 }).rating).toBe(Rating.Good);
  });
  it("caps hints, typos and alternatives at Hard", () => {
    expect(deriveRating({ outcome: "correct", independent: true, recognitionOnly: false, hintsUsed: 1, selfRating: Rating.Easy }).rating).toBe(Rating.Hard);
    expect(deriveRating({ outcome: "typo", independent: true, recognitionOnly: false, hintsUsed: 0 }).rating).toBe(Rating.Hard);
    expect(deriveRating({ outcome: "alternative", independent: true, recognitionOnly: false, hintsUsed: 0 }).rating).toBe(Rating.Hard);
  });
  it("lets self-assessment lower but not override failure, and records overconfidence", () => {
    const r = deriveRating({ outcome: "wrong", independent: true, recognitionOnly: false, hintsUsed: 0, selfRating: Rating.Easy });
    expect(r.rating).toBe(Rating.Again);
    expect(r.overconfident).toBe(true);
    expect(deriveRating({ outcome: "correct", independent: true, recognitionOnly: false, hintsUsed: 0, selfRating: Rating.Hard }).rating).toBe(Rating.Hard);
  });
  it("caps self-graded flip cards for overconfident learners", () => {
    expect(deriveRating({ outcome: "correct", independent: false, recognitionOnly: false, hintsUsed: 0, selfRating: Rating.Easy, overconfidence: 3 }).rating).toBe(Rating.Hard);
  });
  it("reduces a slow Easy to Good", () => {
    expect(deriveRating({ outcome: "correct", independent: true, recognitionOnly: false, hintsUsed: 0, selfRating: Rating.Easy, latencyMs: 30000 }).rating).toBe(Rating.Good);
  });
});

describe("typed answers", () => {
  const spec = { expected: ["to undermine"], alternatives: ["to erode"], distractors: ["undermind"] };
  it("normalises case, spacing, punctuation, 'to' and placeholders", () => {
    expect(normalizeAnswer("  To   Shed light on sth. ")).toBe("shed light on");
    expect(checkAnswer("UNDERMINE", spec).kind).toBe("exact");
    expect(checkAnswer("to undermine!", spec).kind).toBe("exact");
  });
  it("accepts valid alternatives but distinguishes them", () => {
    expect(checkAnswer("erode", spec)).toEqual({ kind: "alternative", matched: "to erode" });
  });
  it("tolerates small spelling slips depending on policy", () => {
    expect(checkAnswer("undremine", spec).kind).toBe("typo");
    expect(checkAnswer("undremine", { ...spec, tolerance: "strict" }).kind).not.toBe("typo");
    expect(checkAnswer("exacerbat", { expected: ["exacerbate"] }).kind).toBe("typo");
  });
  it("does not accept a different word as a typo", () => {
    expect(checkAnswer("effect", { expected: ["affect"], distractors: ["effect"] }).kind).toBe("confused");
    expect(checkAnswer("weaken", spec).kind).toBe("wrong");
  });
  it("detects the wrong grammatical form in context", () => {
    expect(checkAnswer("exacerbate", { expected: ["exacerbated"], formSensitive: true }).kind).toBe("wrong_form");
    expect(checkAnswer("exacerbation", { expected: ["exacerbate"] }).kind).toBe("wrong_form");
  });
});

const entry = (over: Partial<EntryLite> = {}): EntryLite => ({
  id: "e1", headword: "to exacerbate", partOfSpeech: "verb", translationDe: "verschärfen", definitionEn: "to make a problem worse",
  collocations: ["exacerbate tensions", "exacerbate the problem"], synonyms: ["aggravate", "worsen"], antonyms: ["alleviate"],
  wordFamily: [{ form: "exacerbation", pos: "noun" }], confusables: [{ word: "aggravate", distinction: "also 'annoy' informally" }],
  acceptedAnswers: [], examples: ["The drought exacerbated the food crisis."], ...over,
});
const pool: EntryLite[] = [
  entry(),
  entry({ id: "e2", headword: "to mitigate", translationDe: "abmildern", synonyms: [], antonyms: [], confusables: [], examples: [] }),
  entry({ id: "e3", headword: "to bolster", translationDe: "stärken", synonyms: [], antonyms: [], confusables: [], examples: [] }),
  entry({ id: "e4", headword: "to curtail", translationDe: "einschränken", synonyms: [], antonyms: [], confusables: [], examples: [] }),
];

describe("exercises", () => {
  it("builds clozes with the inflected form", () => {
    expect(makeCloze("The drought exacerbated the food crisis.", "to exacerbate")).toEqual({
      text: "The drought _____ the food crisis.", answer: "exacerbated",
    });
    expect(makeCloze("This poses a serious threat.", "to pose a threat")?.answer).toBe("poses a serious threat");
  });
  it("generates every kind when data allows and nothing otherwise", () => {
    const ex = generateExercise("collocation", pool[0], pool, "s");
    expect(ex?.prompt).toMatch(/_____ (tensions|the problem)/);
    expect(generateExercise("cloze", pool[1], pool, "s")).toBeNull();
    const mc = generateExercise("meaning_choice", pool[0], pool, "s");
    expect(mc?.answer.type).toBe("choice");
    if (mc?.answer.type === "choice") expect(mc.answer.options[mc.answer.correct]).toBe("verschärfen");
    expect(generateExercise("synonym_choice", pool[0], pool, "s")?.recognitionOnly).toBe(true);
  });
  it("chooses easier types for new words and demanding ones for familiar words", () => {
    const fresh = chooseKind(pool[0], pool, { reps: 0, lapses: 0, stability: 0, mastery: {}, overconfidence: 0, difficult: false }, "x");
    expect(["flip_en_de", "meaning_choice", "typed_definition"]).toContain(fresh?.kind);
    const familiar = chooseKind(pool[0], pool, { reps: 8, lapses: 0, stability: 30, mastery: { collocation: { score: 0.2, n: 2 } }, overconfidence: 0, difficult: false }, "x");
    expect(["collocation", "production"]).toContain(familiar?.kind);
    const overconf = chooseKind(pool[0], pool, { reps: 3, lapses: 0, stability: 5, mastery: {}, overconfidence: 2, difficult: false }, "x");
    expect(overconf?.answer.type).toBe("typed");
  });
});

describe("mastery", () => {
  it("never reports mastery from recognition alone", () => {
    let m = {};
    for (let i = 0; i < 10; i++) m = applyEvidence(m, evidenceFor({ kind: "meaning_choice", dimension: "recognition" }, 1), T0);
    expect(masteryLevel(m, 100)).toBe("recognised");
    for (let i = 0; i < 5; i++) m = applyEvidence(m, { meaning: 1, production: 1 }, T0);
    expect(masteryLevel(m, 100)).toBe("productive");
    for (let i = 0; i < 3; i++) m = applyEvidence(m, { writing: 1 }, T0);
    expect(masteryLevel(m, 100)).toBe("mastered");
    expect(masteryLevel(m, 5)).toBe("productive");
  });
});

describe("queue", () => {
  const base = (id: string, over: Partial<QueueState> = {}): QueueState => ({
    entryId: id, due: new Date(T0.getTime() - day), state: State.Review, reps: 3, lapses: 0, stability: 5,
    lastReview: new Date(T0.getTime() - 6 * day), mastery: {}, markedDifficult: false, topicIds: ["a"], introduced: true, ...over,
  });
  const opts = { now: T0, endOfDay: new Date(T0.getTime() + 12 * 3600000), minutes: 10, newLimitRemaining: 2, reviewLimitRemaining: 100, mode: "mixed" as const };

  it("puts relearning and overdue first, adds new words within the limit", () => {
    const states = [
      base("old", { due: new Date(T0.getTime() - 10 * day) }),
      base("relearn", { state: State.Relearning }),
      base("n1", { introduced: false, state: State.New }),
      base("n2", { introduced: false, state: State.New }),
      base("n3", { introduced: false, state: State.New }),
    ];
    const q = buildQueue(states, { ...opts, mode: "focused" });
    expect(q.items.map((i) => i.entryId)).toEqual(["relearn", "old", "n1", "n2"]);
    expect(q.newAvailable).toBe(3);
  });

  it("defers (never discards) overdue cards beyond the review limit", () => {
    const states = Array.from({ length: 10 }, (_, i) => base(`d${i}`));
    const q = buildQueue(states, { ...opts, reviewLimitRemaining: 4 });
    expect(q.items.filter((i) => i.schedule)).toHaveLength(4);
    expect(q.deferred).toBe(6);
    expect(q.dueTotal).toBe(10);
  });

  it("interleaves topics and respects a topic focus", () => {
    const states = [base("a1"), base("a2"), base("b1", { topicIds: ["b"] }), base("b2", { topicIds: ["b"] })];
    const mixed = buildQueue(states, opts).items.map((i) => i.entryId);
    expect(mixed[0][0]).not.toBe(mixed[1][0]);
    expect(buildQueue(states, { ...opts, topicId: "b" }).items.map((i) => i.entryId).sort()).toEqual(["b1", "b2"]);
    expect(interleave([{ topicKey: "x" }, { topicKey: "x" }, { topicKey: "y" }]).map((i) => i.topicKey)).toEqual(["x", "y", "x"]);
  });

  it("practice mode fills up with any words, new ones included, without scheduling", () => {
    const states = [base("n1", { introduced: false, state: State.New }), base("later", { due: new Date(T0.getTime() + 9 * day) })];
    const q = buildQueue(states, { ...opts, mode: "practice" });
    expect(q.items.map((i) => i.entryId).sort()).toEqual(["later", "n1"]);
    expect(q.items.every((i) => !i.schedule)).toBe(true);
  });

  it("adds weak words as unscheduled extra practice", () => {
    const states = [base("weak", { due: new Date(T0.getTime() + 20 * day), stability: 20, mastery: { production: { score: 0.1, n: 2 } } })];
    const q = buildQueue(states, opts);
    expect(q.items).toEqual([{ entryId: "weak", reason: "weak_production", schedule: false }]);
  });
});

describe("in-session retry", () => {
  it("retries a missed word with different kinds, context recall first", () => {
    const missed = generateExercise("flip_en_de", pool[0], pool, "s")!;
    const retries = retryExercises(missed, pool[0], pool, "s");
    expect(retries.map((r) => r.kind)).toEqual(["cloze", "collocation"]);
    expect(retries.every((r) => r.entryId === "e1")).toBe(true);
    expect(retryKinds("cloze", ["cloze", "collocation", "typed_de_en"])).toEqual(["collocation", "typed_de_en"]);
  });
  it("keeps a multi-kind restriction (sprint) and returns nothing when no other kind exists", () => {
    expect(retryKinds("meaning_choice", availableKinds(pool[0], pool), ["meaning_choice", "typed_de_en"])).toEqual(["typed_de_en"]);
    expect(retryKinds("production", ["production"])).toEqual([]);
    // A single-kind practice mode may retry with any other kind the word supports.
    expect(retryKinds("word_family", ["word_family", "cloze"], ["word_family"])).toEqual(["cloze"]);
  });
});

describe("adaptive Mixed Challenge", () => {
  it("moves up after two successes in a row and down after an error", () => {
    expect(adaptiveTier([])).toBe(2);
    expect(adaptiveTier(["correct"])).toBe(2);
    expect(adaptiveTier(["correct", "typo"])).toBe(3);
    expect(adaptiveTier(["correct", "correct", "correct", "correct", "correct", "correct"])).toBe(4);
    expect(adaptiveTier(["correct", "correct", "wrong"])).toBe(2);
    expect(adaptiveTier(["wrong", "revealed", "wrong"])).toBe(1);
    expect(adaptiveTier(["correct", "partial", "correct"])).toBe(2);
  });
  it("offers one variant per tier and picks the closest (easier on a tie)", () => {
    const variants = adaptiveVariants(pool[0], pool, "s");
    expect(variants.map((v) => KIND_TIER[v.kind])).toEqual([1, 2, 3, 4]);
    expect(adaptiveVariants(pool[0], pool, "s").map((v) => v.id)).toEqual(variants.map((v) => v.id));
    expect(KIND_TIER[pickVariant(variants, 4)!.kind]).toBe(4);
    expect(KIND_TIER[pickVariant(variants, 1)!.kind]).toBe(1);
    const gappy = variants.filter((v) => KIND_TIER[v.kind] === 1 || KIND_TIER[v.kind] === 3);
    expect(KIND_TIER[pickVariant(gappy, 2)!.kind]).toBe(1);
    expect(pickVariant([], 2)).toBeUndefined();
  });
});

describe("EN→DE meaning check", () => {
  it("shows an example sentence and accepts any listed German translation", () => {
    const e = entry({ translationDe: "verschärfen, verschlimmern (Problem)" });
    const ex = generateExercise("meaning_en_de", e, pool, "s")!;
    expect(ex.prompt).toBe("The drought exacerbated the food crisis.");
    expect(ex.context).toContain("exacerbated");
    expect(ex.answer.type).toBe("typed");
    if (ex.answer.type !== "typed") return;
    expect(checkAnswer("verschärfen", ex.answer.spec).kind).toBe("exact");
    expect(checkAnswer("Verschlimmern", ex.answer.spec).kind).toBe("exact");
    expect(checkAnswer("verschlimern", ex.answer.spec).kind).toBe("typo");
    expect(checkAnswer("verbessern", ex.answer.spec).kind).toBe("wrong");
  });
  it("splits translations and needs a German meaning plus an example", () => {
    expect(germanMeaningAnswers("abmildern; lindern / mildern oder dämpfen")).toEqual(["abmildern", "lindern", "mildern", "dämpfen"]);
    expect(germanMeaningAnswers("(etw.) verschärfen")).toEqual(["(etw.) verschärfen", "verschärfen"]);
    expect(generateExercise("meaning_en_de", pool[1], pool, "s")).toBeNull();
    expect(generateExercise("meaning_en_de", entry({ translationDe: null }), pool, "s")).toBeNull();
    expect(evidenceFor({ kind: "meaning_en_de", dimension: "meaning" }, 1)).toEqual({ meaning: 1, recognition: 1 });
  });
});

describe("exam-date weighting", () => {
  const base = (id: string, over: Partial<QueueState> = {}): QueueState => ({
    entryId: id, due: new Date(T0.getTime() + 30 * day), state: State.Review, reps: 5, lapses: 0, stability: 30,
    lastReview: new Date(T0.getTime() - 6 * day), mastery: { production: { score: 0.9, n: 3 }, collocation: { score: 0.9, n: 3 }, writing: { score: 1, n: 1 } },
    markedDifficult: false, topicIds: ["other"], introduced: true, ...over,
  });
  const opts = { now: T0, endOfDay: new Date(T0.getTime() + 12 * 3600000), minutes: 10, newLimitRemaining: 0, reviewLimitRemaining: 100, mode: "mixed" as const };

  it("is active only within 8 weeks before the exam", () => {
    expect(examPrepActive("2026-03-10", T0)).toBe(true);
    expect(examPrepActive("2026-05-05", T0)).toBe(true); // 56 days
    expect(examPrepActive("2026-05-06", T0)).toBe(false);
    expect(examPrepActive("2026-03-09", T0)).toBe(false);
    expect(examPrepActive(null, T0)).toBe(false);
    expect(examPrepActive("soon", T0)).toBe(false);
  });

  it("gives exam-relevant words most of a larger extra-practice share, weakest production/collocation first", () => {
    const states = [
      ...Array.from({ length: 10 }, (_, i) => base(`weak${i}`, { markedDifficult: true })),
      base("examStrong", { topicIds: ["exam"] }),
      base("examWeakCol", { topicIds: ["exam"], mastery: { production: { score: 0.9, n: 3 }, collocation: { score: 0.1, n: 3 } } }),
      base("examWeakProd", { topicIds: ["exam"], mastery: { production: { score: 0.3, n: 3 }, collocation: { score: 0.8, n: 3 } } }),
    ];
    const without = buildQueue(states, opts).items;
    expect(without).toHaveLength(Math.ceil(30 * 0.25));
    expect(without.some((i) => i.entryId === "examStrong")).toBe(false); // not weak: no extra practice without an exam

    // focused mode keeps the selection order (no interleaving), so the ranking is visible
    const withExam = buildQueue(states, { ...opts, mode: "focused", examFocus: { topicIds: ["exam"] } }).items;
    expect(withExam).toHaveLength(Math.ceil(30 * 0.4));
    expect(withExam.slice(0, 3).map((i) => i.entryId)).toEqual(["examWeakCol", "examWeakProd", "examStrong"]);
    expect(withExam.find((i) => i.entryId === "examStrong")?.reason).toBe("exam_prep");
    expect(withExam.find((i) => i.entryId === "examWeakCol")?.reason).toBe("weak_collocation");
    expect(withExam.filter((i) => i.entryId.startsWith("weak"))).toHaveLength(9);
    expect(new Set(withExam.map((i) => i.entryId)).size).toBe(withExam.length);
    expect(withExam.every((i) => !i.schedule)).toBe(true);
  });

  it("leaves room for other weak words when there are many exam words", () => {
    const states = [
      ...Array.from({ length: 10 }, (_, i) => base(`weak${i}`, { markedDifficult: true })),
      ...Array.from({ length: 20 }, (_, i) => base(`exam${i}`, { topicIds: ["exam"] })),
    ];
    const items = buildQueue(states, { ...opts, examFocus: { topicIds: ["exam"] } }).items;
    expect(items.filter((i) => i.entryId.startsWith("exam"))).toHaveLength(Math.ceil(12 * (2 / 3)));
    expect(items.filter((i) => i.entryId.startsWith("weak"))).toHaveLength(4);
  });

  it("treats every word as exam-relevant when no exam topics are known, and never touches review-only mode", () => {
    const states = [base("a"), base("b", { topicIds: [] })];
    expect(buildQueue(states, { ...opts, examFocus: { topicIds: null } }).items.map((i) => i.entryId).sort()).toEqual(["a", "b"]);
    expect(buildQueue(states, { ...opts, mode: "review", examFocus: { topicIds: null } }).items).toEqual([]);
  });
});
