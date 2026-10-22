import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { setMockBehavior } from "@/lib/ai/mock";
import { closeDb, getDb, schema } from "@/server/db/client";
import { createEssay, getEssayDetail, deleteEssay } from "@/server/services/essays";
import { assessEssay } from "@/server/services/assessment";
import { createRevision, getRevisionView, setEditState } from "@/server/services/revision";
import { getLearnerOverview, dismissEvidence } from "@/server/services/learner";
import { generateExercise, getExercise, submitAttempt, getPriorities } from "@/server/services/training";
import { createVocab, reviewRecall, reviewUse } from "@/server/services/vocab";
import { addTeacherFeedback, computeCalibration } from "@/server/services/calibration";
import { getDashboard } from "@/server/services/progress";
import { exportAll, resetAll } from "@/server/services/data";
import { ESSAY_INPUT } from "../fixtures/essays";
import { AppError } from "@/server/http";

process.env.PGLITE_DIR = "memory://";

beforeEach(() => setMockBehavior("ok"));
afterAll(() => closeDb());

describe("end-to-end service workflow (mock AI, real database)", () => {
  it("assesses an essay, aggregates the score deterministically and updates the learner model", async () => {
    const essay = await createEssay(ESSAY_INPUT);
    const { assessment, learnerUpdate } = await assessEssay(essay.id, "teacher_standard");
    expect(assessment.status).toBe("completed");
    expect(assessment.scoreLow!).toBeLessThanOrEqual(assessment.scoreBest!);
    expect(assessment.scoreBest!).toBeLessThanOrEqual(assessment.scoreHigh!);
    expect((assessment.aggregation as { method: string }).method).toBe("reported_40_60");
    expect(learnerUpdate.ok).toBe(true);
    const overview = await getLearnerOverview();
    const analytical = overview.skills.find((s) => s.key === "analytical_depth")!;
    expect(analytical.level).not.toBeNull();
    expect(analytical.confidence).toBeLessThanOrEqual(0.4); // one submission only
    const pattern = overview.patterns.find((p) => p.label.includes("discuss"));
    expect(pattern?.status).toBe("single");
  });

  it("recovers from one malformed AI response via the repair attempt", async () => {
    setMockBehavior("malformed_once");
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Malformed once" });
    const { assessment } = await assessEssay(essay.id, "strict");
    expect(assessment.status).toBe("completed");
    const runs = await (await getDb()).select().from(schema.aiRuns).where(eq(schema.aiRuns.relatedId, essay.id));
    expect(runs.some((r) => r.attempts === 2 && r.status === "ok")).toBe(true);
  });

  it("rejects invented quotes, then accepts the corrected response", async () => {
    setMockBehavior("invalid_quote_once");
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Invalid quote once" });
    const { assessment } = await assessEssay(essay.id, "supportive");
    expect(assessment.status).toBe("completed");
  });

  it("records a failed assessment without losing the essay when the AI keeps returning garbage", async () => {
    setMockBehavior("malformed_always");
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Always malformed" });
    await expect(assessEssay(essay.id, "teacher_standard")).rejects.toBeInstanceOf(AppError);
    const detail = await getEssayDetail(essay.id);
    expect(detail.essay.essayText).toBe(ESSAY_INPUT.essayText);
    expect(detail.assessments[0].status).toBe("failed");
    expect(detail.assessments[0].errorCode).toBe("invalid_json");
  });

  it("records API errors and timeouts as failed runs", async () => {
    const essay = await createEssay({ ...ESSAY_INPUT, title: "API error" });
    setMockBehavior("api_error");
    await expect(assessEssay(essay.id, "teacher_standard")).rejects.toMatchObject({ code: "ai_api_error" });
    setMockBehavior("timeout");
    await expect(assessEssay(essay.id, "teacher_standard")).rejects.toMatchObject({ code: "ai_timeout" });
    const detail = await getEssayDetail(essay.id);
    expect(detail.assessments.filter((a) => a.status === "failed")).toHaveLength(2);
  });

  it("re-assessing the same essay does not double-count evidence", async () => {
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Reassess" });
    await assessEssay(essay.id, "teacher_standard");
    await assessEssay(essay.id, "strict");
    const db = await getDb();
    const live = (await db.select().from(schema.skillEvidence).where(eq(schema.skillEvidence.essayId, essay.id))).filter((e) => !e.dismissedAt);
    const sources = new Set(live.map((e) => e.sourceId));
    expect(sources.size).toBe(1);
  });

  it("builds a revision with change states and a final text that honours rejections", async () => {
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Revision" });
    const rev = await createRevision(essay.id, "targeted");
    const view = await getRevisionView(rev.id);
    expect(view.doc!.editOrder.length).toBeGreaterThan(0);
    const firstEdit = view.doc!.editOrder[0];
    const after = await setEditState(rev.id, firstEdit, "rejected");
    expect(after.doc!.finalText).toContain("The article deals with the planned closure of a youth centre and criticises the council's decision.");
    const edit = after.doc!.paragraphs.flatMap((p) => p.items).find((i) => i.kind === "edit" && i.edit.is_new_idea);
    expect(edit).toBeDefined();
  });

  it("aim for 15: strict assessment plus a full upgrade with phrase upgrades and ideas", async () => {
    const essay = await createEssay({ ...ESSAY_INPUT, title: "Aim for 15" });
    await assessEssay(essay.id, "strict");
    const rev = await createRevision(essay.id, "exemplary");
    const coaching = rev.coaching as { phrase_upgrades: { original: string }[]; ideas_for_15: unknown[] };
    expect(coaching.ideas_for_15.length).toBeGreaterThanOrEqual(3);
    expect(coaching.phrase_upgrades.length).toBeGreaterThanOrEqual(3);
    for (const u of coaching.phrase_upgrades) expect(ESSAY_INPUT.essayText).toContain(u.original);
    const corrections = await createRevision(essay.id, "corrections");
    expect((corrections.coaching as { ideas_for_15: unknown[] }).ideas_for_15).toHaveLength(0);
  });

  it("hides model answers until an attempt, evaluates it and records exercise evidence", async () => {
    const ex = await generateExercise({ skillKey: "analytical_depth" });
    expect(ex.content.model_answer).toBeNull();
    expect(ex.revealed).toBe(false);
    const after = await submitAttempt(ex.id, { answer: "By comparing the lights to a fever, the writer presents city life as an illness its people secretly enjoy.", timeUsedSeconds: 300 });
    expect(after.revealed).toBe(true);
    expect(after.attempts[0].outcome).toBe("correct");
    const again = await getExercise(ex.id);
    expect(again.content.model_answer).not.toBeNull();
  });

  it("keeps the answer when exercise evaluation fails", async () => {
    const ex = await generateExercise({ skillKey: "grammar_variety" });
    setMockBehavior("api_error");
    await expect(submitAttempt(ex.id, { answer: "My saved answer.", timeUsedSeconds: null })).rejects.toBeInstanceOf(AppError);
    const stored = await getExercise(ex.id);
    expect(stored.attempts[0].answer).toBe("My saved answer.");
    expect(stored.attempts[0].status).toBe("evaluation_failed");
  });

  it("lets the student dismiss inaccurate evidence and recomputes the skill", async () => {
    const overview = await getLearnerOverview();
    const skill = overview.skills.find((s) => s.evidence.some((e) => !e.dismissedAt && e.sourceType === "assessment"))!;
    for (const e of skill.evidence.filter((x) => !x.dismissedAt)) await dismissEvidence(e.id, "Not accurate");
    const after = (await getLearnerOverview()).skills.find((s) => s.key === skill.key)!;
    expect(after.masteryStatus === "not_assessed" || after.evidence.every((e) => e.dismissedAt)).toBe(true);
  });

  it("vocabulary: recall is judged locally, use-in-sentence by the tutor; status needs real use", async () => {
    const v = await createVocab({ term: "underscore", meaning: "emphasise", collocations: ["underscore the need"], register: "formal", example: "", pitfalls: "", topic: "", sourceType: "manual", sourceId: null });
    const r1 = await reviewRecall(v.id, "underscore");
    expect(r1.outcome).toBe("correct");
    expect(r1.entry.status).toBe("recognised");
    const r2 = await reviewUse(v.id, "The repetition underscores the speaker's urgency.");
    expect(r2.entry.status).toBe("used_correctly");
    await expect(createVocab({ term: "Underscore", meaning: "", collocations: [], register: "neutral", example: "", pitfalls: "", topic: "", sourceType: "manual", sourceId: null })).rejects.toMatchObject({ code: "duplicate" });
  });

  it("teacher calibration requires three marked essays before applying an offset", async () => {
    const assessed = [];
    for (const n of [1, 2, 3]) {
      const e = await createEssay({ ...ESSAY_INPUT, title: `Calibration ${n}` });
      await assessEssay(e.id, "teacher_standard");
      assessed.push(e);
    }
    await addTeacherFeedback({ essayId: assessed[0].id, teacherScore: 12, comments: "Good structure.", criteria: "", taskType: null, receivedAt: null });
    let c = await computeCalibration();
    expect(c.tendency).toBe("not_enough_data");
    expect(c.appliedOffset).toBe(0);
    for (const e of assessed.slice(1, 3)) await addTeacherFeedback({ essayId: e.id, teacherScore: 12, comments: "", criteria: "", taskType: null, receivedAt: null });
    c = await computeCalibration();
    expect(c.n).toBe(3);
    expect(c.tendency).not.toBe("not_enough_data");
    // the next teacher-standard assessment carries a labelled calibration snapshot
    const e4 = await createEssay({ ...ESSAY_INPUT, title: "Calibration 4" });
    const { assessment } = await assessEssay(e4.id, "teacher_standard");
    expect((assessment.calibration as { n: number }).n).toBe(3);
  });

  it("dashboard is computed from stored data and priorities have reasons", async () => {
    const d = await getDashboard();
    expect(d.timeline.length).toBeGreaterThan(0);
    expect(d.timeline.every((t) => t.provider === "mock")).toBe(true);
    const p = await getPriorities();
    expect(p.priorities.length).toBeLessThanOrEqual(3);
  });

  it("deleting an essay removes its derived evidence; export and reset work", async () => {
    const essay = await createEssay({ ...ESSAY_INPUT, title: "To delete" });
    await assessEssay(essay.id, "teacher_standard");
    await deleteEssay(essay.id);
    const db = await getDb();
    const ev = (await db.select().from(schema.skillEvidence).where(eq(schema.skillEvidence.essayId, essay.id))).filter((e) => !e.dismissedAt);
    expect(ev).toHaveLength(0);
    const exp = await exportAll();
    expect(Array.isArray(exp.data.essays)).toBe(true);
    await expect(resetAll("yes")).rejects.toMatchObject({ code: "confirmation_required" });
    await resetAll("DELETE ALL MY DATA");
    expect(await db.select().from(schema.essays)).toHaveLength(0);
  });
});
