import { describe, expect, it } from "vitest";
import { computeSkill, patternStatus, type EvidenceItem, type PatternState } from "@/lib/learner/model";
import { nextInterval } from "@/lib/learner/spaced";
import { selectPriorities } from "@/lib/learner/priorities";

const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n));
const ev = (sub: string, level: number | null, n: number, extra: Partial<EvidenceItem> = {}): EvidenceItem => ({
  skillKey: "analytical_depth", submissionKey: sub, sourceType: "assessment", polarity: "neutral", levelEstimate: level, isTransfer: false, createdAt: day(n), ...extra,
});

describe("computeSkill", () => {
  it("has no level and not_assessed status without evidence", () => {
    const r = computeSkill([], [], day(10));
    expect(r.level).toBeNull();
    expect(r.masteryStatus).toBe("not_assessed");
    expect(r.confidence).toBe(0);
  });

  it("caps confidence with a single submission and never calls one strong essay secure", () => {
    const r = computeSkill([ev("e1", 14, 1, { polarity: "strength" }), ev("e1", 14, 1)], [], day(2));
    expect(r.confidence).toBeLessThanOrEqual(0.4);
    expect(r.sourceCount).toBe(1);
    expect(r.masteryStatus).toBe("appears_secure_untested");
  });

  it("requires three independent submissions including transfer evidence for 'secure'", () => {
    const noTransfer = [ev("e1", 13, 1), ev("e2", 13, 2), ev("e3", 14, 3)];
    expect(computeSkill(noTransfer, [], day(4)).masteryStatus).toBe("appears_secure_untested");
    const withTransfer = [...noTransfer, ev("x1", 13, 4, { sourceType: "exercise", isTransfer: true })];
    expect(computeSkill(withTransfer, [], day(5)).masteryStatus).toBe("secure");
  });

  it("detects an improving trend from per-submission levels", () => {
    const items = [ev("a", 7, 1), ev("b", 7, 2), ev("c", 8, 3), ev("d", 10, 4), ev("e", 10, 5), ev("f", 11, 6)];
    const r = computeSkill(items, [], day(7));
    expect(r.trend).toBe("improving");
    expect(r.masteryStatus).toBe("improving");
  });

  it("weights recent evidence more heavily", () => {
    const r = computeSkill([ev("old", 6, 1), ev("new", 12, 2)], [], day(3));
    expect(r.level!).toBeGreaterThan(9);
  });

  it("a recurring pattern overrides a good level", () => {
    const p: PatternState = { skillKey: "analytical_depth", occurrences: [{ submissionKey: "e1", at: day(1).toISOString() }, { submissionKey: "e2", at: day(2).toISOString() }], cleanSubmissions: [] };
    const r = computeSkill([ev("e1", 12, 1), ev("e2", 13, 2)], [p], day(3));
    expect(r.masteryStatus).toBe("recurring_weakness");
  });
});

describe("patternStatus", () => {
  const occ = (k: string, n: number) => ({ submissionKey: k, at: day(n).toISOString() });
  const clean = (k: string, n: number, isTransfer = false) => ({ submissionKey: k, at: day(n).toISOString(), isTransfer });
  it("single → recurring → improving → resolved_provisional", () => {
    expect(patternStatus({ skillKey: "grammar_variety", occurrences: [occ("e1", 1)], cleanSubmissions: [] })).toBe("single");
    const rec: PatternState = { skillKey: "grammar_variety", occurrences: [occ("e1", 1), occ("e2", 2)], cleanSubmissions: [] };
    expect(patternStatus(rec)).toBe("recurring");
    expect(patternStatus({ ...rec, cleanSubmissions: [clean("e3", 3), clean("e4", 4)] })).toBe("improving");
    expect(patternStatus({ ...rec, cleanSubmissions: [clean("e3", 3), clean("e4", 4), clean("e5", 5)] })).toBe("improving");
    expect(patternStatus({ ...rec, cleanSubmissions: [clean("e3", 3), clean("e4", 4), clean("x5", 5, true)] })).toBe("resolved_provisional");
  });
  it("two occurrences in the same essay are not recurring", () => {
    expect(patternStatus({ skillKey: "grammar_variety", occurrences: [occ("e1", 1), occ("e1", 1)], cleanSubmissions: [] })).toBe("single");
  });
  it("recurrence after clean submissions counts as recurring again", () => {
    const p: PatternState = { skillKey: "grammar_variety", occurrences: [occ("e1", 1), occ("e2", 2), occ("e5", 5)], cleanSubmissions: [clean("e3", 3), clean("e4", 4)] };
    expect(patternStatus(p)).toBe("recurring");
  });
});

describe("spaced review", () => {
  it("advances on success, repeats on partial, resets on failure", () => {
    expect(nextInterval(0, "correct")).toBe(1);
    expect(nextInterval(1, "correct")).toBe(3);
    expect(nextInterval(16, "correct")).toBe(35);
    expect(nextInterval(75, "correct")).toBe(75);
    expect(nextInterval(7, "partial")).toBe(7);
    expect(nextInterval(0, "partial")).toBe(1);
    expect(nextInterval(35, "incorrect")).toBe(1);
  });
});

describe("selectPriorities", () => {
  it("returns at most three skills with reasons, favouring recurring weaknesses and action-plan items", () => {
    const p = selectPriorities({
      skills: [
        { skillKey: "analytical_depth", level: 8, confidence: 0.6, masteryStatus: "developing", lastTrainedAt: null },
        { skillKey: "idiomatic_collocations", level: 10, confidence: 0.6, masteryStatus: "recurring_weakness", lastTrainedAt: null },
        { skillKey: "grammar_variety", level: 14, confidence: 0.8, masteryStatus: "secure", lastTrainedAt: null },
      ],
      taskType: "nonfiction_analysis",
      actionPlan: [{ skillKey: "analytical_depth", priority: 1 }],
      recurringBySkill: { idiomatic_collocations: 2 },
    });
    expect(p.length).toBeLessThanOrEqual(3);
    expect(p[0].skillKey).toBe("analytical_depth");
    expect(p.map((x) => x.skillKey)).toContain("idiomatic_collocations");
    expect(p.map((x) => x.skillKey)).not.toContain("grammar_variety");
    expect(p.every((x) => x.reason.length > 0)).toBe(true);
  });
  it("returns nothing when there is no evidence at all", () => {
    expect(selectPriorities({ skills: [], taskType: null, actionPlan: [], recurringBySkill: {} })).toEqual([]);
  });
});
