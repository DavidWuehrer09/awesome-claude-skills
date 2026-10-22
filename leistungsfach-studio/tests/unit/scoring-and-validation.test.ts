import { describe, expect, it } from "vitest";
import { aggregateScore } from "@/lib/scoring/aggregate";
import { validateAssessment } from "@/lib/ai/prompts/assessment";
import { validateRevision } from "@/lib/ai/prompts/revision";
import { validateProgressReview } from "@/lib/ai/prompts/misc";
import { validateLearnerUpdate } from "@/lib/ai/prompts/learnerUpdate";
import { AssessmentOutputSchema, type AssessmentOutput } from "@/lib/ai/schemas";
import { taskTypeDimensions } from "@/lib/curriculum";
import { segmentEssay } from "@/lib/text/segment";
import { buildRevisionDocument, type StoredEdit } from "@/lib/text/revisionDoc";
import { comparisonCaveats, type ComparableAssessment } from "@/lib/progress/caveats";
import { judgeRecall } from "@/server/services/vocab";
import { ESSAY_TEXT, SOURCE_TEXT } from "../fixtures/essays";

const dims = (taskType: Parameters<typeof taskTypeDimensions>[0], v: (k: string) => [number, number, number]) =>
  taskTypeDimensions(taskType).map((key) => { const [low, best, high] = v(key); return { key, low, best, high }; });

describe("aggregateScore", () => {
  it("combines content 40 / language 60 when the reported weighting is on", () => {
    const d = dims("comment", (k) => (["grammar_accuracy", "vocabulary_precision", "idiomaticity", "syntax_style", "register_conventions"].includes(k) ? [10, 10, 10] : [5, 5, 5]));
    const r = aggregateScore(d, "comment", { useReportedWeighting: true });
    expect(r.method).toBe("reported_40_60");
    expect(r.best).toBe(8); // 0.4*5 + 0.6*10
    expect(r.content?.best).toBe(5);
    expect(r.language?.best).toBe(10);
  });
  it("uses equal weighting when switched off", () => {
    const d = dims("comment", (k) => (k === "argumentation" || k === "task_fulfilment" || k === "structure_cohesion" || k === "evidence_use" ? [6, 6, 6] : [12, 12, 12]));
    expect(aggregateScore(d, "comment", { useReportedWeighting: false }).best).toBe(9);
  });
  it("applies the reported content cap", () => {
    const d = dims("nonfiction_analysis", (k) => (["task_fulfilment", "comprehension", "analytical_depth", "evidence_use", "structure_cohesion"].includes(k) ? [1, 2, 2] : [12, 13, 14]));
    const r = aggregateScore(d, "nonfiction_analysis", { useReportedWeighting: true });
    expect(r.capApplied).toBe(true);
    expect(r.high).toBeLessThanOrEqual(3);
  });
  it("keeps ranges honest (floor low, ceil high) and best inside", () => {
    const d = dims("summary", () => [7.4, 8.2, 9.1]);
    const r = aggregateScore(d, "summary", { useReportedWeighting: true });
    expect(r.low).toBe(7); expect(r.high).toBe(10);
    expect(r.best).toBeGreaterThanOrEqual(r.low); expect(r.best).toBeLessThanOrEqual(r.high);
  });
  it("uses dimension weights inside a group", () => {
    const base = (k: string): [number, number, number] => (k === "argumentation" ? [14, 14, 14] : [8, 8, 8]);
    const r = aggregateScore(dims("comment", base), "comment", { useReportedWeighting: true });
    expect(r.content!.best).toBeGreaterThan(10); // argumentation weight 5 of 11
  });
});

function validAssessment(): AssessmentOutput {
  return {
    task_understanding: "Analyse persuasive strategies.",
    dimensions: taskTypeDimensions("nonfiction_analysis").map((key) => ({ key, low: 7, best: 8, high: 9, rationale: "r", evidence: [{ quote: "criticises the council's decision", comment: "c" }] })),
    strengths: [{ title: "Clear topic", quote: "The article deals with the planned closure", why_it_works: "w", dimension: "task_fulfilment" }],
    weaknesses: [{ title: "Generic effect", severity: "major", kind: "conceptual", dimension: "analytical_depth", quotes: ["makes the reader think about the topic"], explanation: "e", why_it_matters: "m", how_to_fix: "f" }],
    action_plan: [{ priority: 1, action: "a", skill_key: "analytical_depth", why: "w" }],
    overall_comment: "o", holistic_check: { low: 7, high: 9 }, confidence: "medium", uncertainty_notes: [], curriculum_references: [], vocabulary_suggestions: [],
  };
}
const input = { taskType: "nonfiction_analysis" as const, essayText: ESSAY_TEXT, sourceText: SOURCE_TEXT, taskPrompt: "Analyse…" };

describe("assessment validation", () => {
  it("accepts a well-formed, evidence-based assessment", () => {
    expect(AssessmentOutputSchema.safeParse(validAssessment()).success).toBe(true);
    expect(validateAssessment(validAssessment(), input)).toEqual([]);
  });
  it("rejects invented quotations", () => {
    const a = validAssessment(); a.weaknesses[0].quotes = ["the author is clearly a genius"];
    expect(validateAssessment(a, input).join(" ")).toMatch(/not found verbatim/);
  });
  it("rejects dimensions that do not belong to the task type, and missing ones", () => {
    const a = validAssessment(); a.dimensions[0] = { ...a.dimensions[0], key: "argumentation" };
    const p = validateAssessment(a, input).join(" ");
    expect(p).toMatch(/not assessed for task type/); expect(p).toMatch(/missing dimension "task_fulfilment"/);
  });
  it("rejects incoherent ranges", () => {
    const a = validAssessment(); a.dimensions[1] = { ...a.dimensions[1], low: 10, best: 8 };
    expect(validateAssessment(a, input).join(" ")).toMatch(/low ≤ best ≤ high/);
  });
  it("requires low confidence when material is missing", () => {
    expect(validateAssessment(validAssessment(), { ...input, sourceText: "" }).join(" ")).toMatch(/confidence must be "low"/);
  });
  it("schema rejects out-of-scale scores and unknown enums (malformed AI output)", () => {
    const a = validAssessment() as unknown as { dimensions: { best: number }[]; confidence: string };
    a.dimensions[0].best = 17; a.confidence = "certain";
    expect(AssessmentOutputSchema.safeParse(a).success).toBe(false);
  });
});

describe("revision validation and document", () => {
  const sentences = segmentEssay(ESSAY_TEXT);
  const edit = (o: Partial<StoredEdit>): StoredEdit => ({ id: "e1", target_ids: ["p2s1"], revised_text: "The author quotes the mayor to expose the council's narrow, purely financial reasoning.", category: "deeper_analysis", explanation: "x", principle: "p", how_to_apply: "h", is_new_idea: false, needs_evidence_note: null, ...o });
  it("accepts valid edits", () => {
    expect(validateRevision({ overview: "o", edits: [edit({})] }, { sentences, sourceText: SOURCE_TEXT, essayText: ESSAY_TEXT })).toEqual([]);
  });
  it("rejects unknown ids, reused ids, cross-paragraph ranges, no-op edits and invented quotes", () => {
    const p = validateRevision({ overview: "o", edits: [
      edit({ target_ids: ["p9s9"] }),
      edit({ target_ids: ["p1s1", "p2s1"] }),
      edit({ target_ids: ["p3s1"], revised_text: sentences.find((s) => s.id === "p3s1")!.text }),
      edit({ target_ids: ["p2s2"], revised_text: 'He calls it "a moral disaster".' }),
      edit({ target_ids: ["p2s2"], revised_text: "Changed." }),
    ] }, { sentences, sourceText: SOURCE_TEXT, essayText: ESSAY_TEXT }).join(" | ");
    expect(p).toMatch(/unknown sentence id/);
    expect(p).toMatch(/same paragraph/);
    expect(p).toMatch(/identical to the original/);
    expect(p).toMatch(/do not appear in the source text/);
    expect(p).toMatch(/already used/);
  });
  it("builds final text honouring rejected edits and keeps unchanged sentences verbatim", () => {
    const doc = buildRevisionDocument(sentences, [edit({})], { e1: "rejected" });
    expect(doc.finalText).toBe(ESSAY_TEXT.replace(/\n\n/g, "\n").split("\n").join("\n\n"));
    const doc2 = buildRevisionDocument(sentences, [edit({})], {});
    expect(doc2.finalText).toContain("expose the council's narrow");
    expect(doc2.byCategory.deeper_analysis).toBe(1);
    expect(doc2.stats.retained).toBeGreaterThan(0);
  });
});

describe("other validators", () => {
  it("progress review: rejects numbers that are not in the statistics", () => {
    const stats = { essays_assessed: 4, skills: [{ level: 9.5 }] };
    const ok = { summary: "You assessed 4 essays; analysis is at 9.5.", improvements: [], concerns: [], comparability_cautions: [], next_steps: ["a", "b", "c"] };
    expect(validateProgressReview(ok, stats)).toEqual([]);
    expect(validateProgressReview({ ...ok, summary: "Your average rose by 2.7 points." }, stats).join(" ")).toMatch(/2.7/);
  });
  it("learner update: quotes must come from the student's text and pattern ids must exist", () => {
    const p = validateLearnerUpdate({ observations: [{ skill_key: "analytical_depth", polarity: "weakness", quote: "not in the text", note: "n", level_estimate: 8 }], error_patterns: [{ existing_pattern_id: "nope", label: "l", category: "grammar", skill_key: "grammar_variety", example_quote: "discusses about", correction: "discusses", explanation: "e" }], checked_absent_pattern_ids: [] }, { studentText: ESSAY_TEXT, knownPatternIds: [] });
    expect(p.join(" ")).toMatch(/quote not found/); expect(p.join(" ")).toMatch(/unknown existing_pattern_id/);
  });
  it("vocabulary recall is tolerant to case and a small typo only", () => {
    expect(judgeRecall("underscore", "Underscore")).toBe("correct");
    expect(judgeRecall("juxtaposition", "juxtapositon")).toBe("partial");
    expect(judgeRecall("underscore", "emphasise")).toBe("incorrect");
  });
});

describe("comparison caveats", () => {
  const base: ComparableAssessment = { taskType: "comment", mode: "teacher_standard", low: 9, high: 11, best: 10, confidence: "medium", hasTaskPrompt: true, hasSourceText: true, wordCount: 500, timed: false, promptVersion: "assessment-1.0" };
  it("flags different task types, modes and overlapping ranges", () => {
    const c = comparisonCaveats(base, { ...base, taskType: "literary_analysis", mode: "strict", low: 8, high: 10, best: 9 });
    expect(c.join(" ")).toMatch(/Different task types/);
    expect(c.join(" ")).toMatch(/Different assessment modes/);
    expect(c.join(" ")).toMatch(/margin of uncertainty/);
  });
  it("no caveats for comparable, clearly different results", () => {
    expect(comparisonCaveats(base, { ...base, low: 12, high: 13, best: 12 })).toEqual([]);
  });
});
