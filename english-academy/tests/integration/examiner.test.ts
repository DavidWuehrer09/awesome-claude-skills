import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { validAssessment } from "../fixtures/examiner";
import { freshDb, twoUsers } from "./helpers";

const structured = vi.fn();
vi.mock("@/server/ai/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/anthropic")>()),
  anthropicStructured: (...args: unknown[]) => structured(...args),
}));

const ex = await import("@/server/repos/examiner");

let db: Db;
let close: () => Promise<void>;
let users: Awaited<ReturnType<typeof twoUsers>>;
const enc = (s: string) => new TextEncoder().encode(s);

const OLD_EXAM = `2. Schulaufgabe aus dem Englischen – Q12
Name: ________  Arbeitszeit: 90 minutes  Hilfsmittel: einsprachiges Wörterbuch

Text: "Small Town Blues" (fictional, written by the teacher)

1. Outline the narrator's situation in about 120 words.
2. Analyse how the atmosphere of the extract is created.
3. Comment on the claim that young people should leave rural areas for the city. Write about 300 words.`;

const RUBRIC = `Bewertungsraster Englisch Q12
Inhalt / Sprache: Gewichtung 1:1
Language: precise vocabulary, varied sentence structure, formal register.
Use formal register throughout and avoid contractions.`;

beforeAll(async () => {
  ({ db, close } = await freshDb());
  users = await twoUsers(db);
});
afterAll(() => close());
afterEach(() => {
  vi.unstubAllEnvs();
  structured.mockReset();
});

let examPaperId: string;
let rubricId: string;
let examId: string;
let attemptId: string;

describe("materials", () => {
  it("uploads several files, guesses their type and requires confirmation and review", async () => {
    const rows = await ex.uploadMaterials(db, users.alice.id, [{ name: "schulaufgabe2.txt", bytes: enc(OLD_EXAM) }, { name: "raster.txt", bytes: enc(RUBRIC) }]);
    expect(rows.map((r) => r.guess)).toEqual(["exam_paper", "rubric"]);
    expect(rows.every((r) => r.extractionStatus === "needs_review" && r.docType === null)).toBe(true);
    [examPaperId, rubricId] = rows.map((r) => r.id);
    expect((await ex.getMaterial(db, users.alice.id, examPaperId)).usable).toBe(false);
  });

  it("rejects the whole upload when one file is unsupported", async () => {
    const before = (await ex.listMaterials(db, users.alice.id)).length;
    await expect(ex.uploadMaterials(db, users.alice.id, [{ name: "ok.txt", bytes: enc("fine") }, { name: "bad.bin", bytes: new Uint8Array([0, 1, 2, 0]) }])).rejects.toThrow(/bad\.bin/);
    expect((await ex.listMaterials(db, users.alice.id)).length).toBe(before);
  });

  it("keeps a text history and becomes usable once confirmed and reviewed", async () => {
    await ex.updateMaterial(db, users.alice.id, examPaperId, { docType: "exam_paper", reviewed: true, labels: { topic: ["Rural life"], importance: "high" } });
    const m = await ex.updateMaterial(db, users.alice.id, rubricId, { docType: "rubric", text: `${RUBRIC}\nInhalt 50 %, Sprache 50 %.` });
    expect(m.usable).toBe(true);
    expect(m.textHistory).toHaveLength(1);
    expect(m.originalText).toBe(RUBRIC);
  });

  it("searches text and labels, and flags duplicates", async () => {
    const hits = await ex.listMaterials(db, users.alice.id, { q: "atmosphere" });
    expect(hits.map((h) => h.id)).toEqual([examPaperId]);
    expect(hits[0].snippets[0]).toMatch(/atmosphere/);
    expect((await ex.listMaterials(db, users.alice.id, { topic: "rural" })).map((h) => h.id)).toEqual([examPaperId]);
    const [dup] = await ex.uploadMaterials(db, users.alice.id, [{ name: "copy.txt", bytes: enc(OLD_EXAM) }]);
    expect((await ex.listMaterials(db, users.alice.id)).find((h) => h.id === dup.id)?.duplicateOf).toBe(examPaperId);
    await ex.deleteMaterial(db, users.alice.id, dup.id);
  });

  it("isolates users", async () => {
    await expect(ex.getMaterial(db, users.bob.id, examPaperId)).rejects.toMatchObject({ status: 404 });
    await expect(ex.updateMaterial(db, users.bob.id, examPaperId, { docType: "other" })).rejects.toMatchObject({ status: 404 });
    expect(await ex.listMaterials(db, users.bob.id)).toEqual([]);
  });
});

describe("course profile", () => {
  it("adds entries all-or-nothing under the honesty rules", async () => {
    await expect(ex.addProfileEntries(db, users.alice.id, [
      { section: "language_expectations", statement: "Avoid contractions", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: rubricId, quote: "avoid contractions" }] },
      { section: "time_limit", statement: "90 minutes", provenance: "observed_pattern", confidence: "high", evidence: [{ materialId: examPaperId, quote: "90 minutes" }] },
    ])).rejects.toMatchObject({ status: 422 });
    expect((await ex.getProfile(db, users.alice.id)).entries).toHaveLength(0);
    const added = await ex.addProfileEntries(db, users.alice.id, [
      { section: "language_expectations", statement: "Avoid contractions", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: rubricId, quote: "avoid contractions" }] },
      { section: "time_limit", statement: "90 minutes", provenance: "observed_pattern", confidence: "provisional", evidence: [{ materialId: examPaperId, quote: "90 minutes" }] },
    ]);
    expect(added).toHaveLength(2);
    const p = await ex.getProfile(db, users.alice.id);
    expect(p.notes[0]).toMatch(/provisional/);
    expect(p.entries.every((e) => e.problems.length === 0)).toBe(true);
  });

  it("suggests observed patterns in demo mode without saving them", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const s = await ex.suggestProfile(db, users.alice.id);
    expect(s.demo).toBe(true);
    expect(s.entries.some((e) => e.section === "answer_length" && e.confidence === "provisional")).toBe(true);
    expect((await ex.getProfile(db, users.alice.id)).entries).toHaveLength(2);
  });

  it("records official guidance only with a link", async () => {
    const c = await ex.updateCourse(db, users.alice.id, { yearLevel: "Q12", addGuidance: { title: "ISB Abitur English", url: "https://www.isb.bayern.de/", summary: "Checked format page", verified: false } });
    expect(c.officialGuidance[0]).toMatchObject({ verified: false });
    await expect(ex.updateCourse(db, users.alice.id, { addGuidance: { title: "Bad", url: "javascript:alert(1)", summary: "", verified: true } })).rejects.toThrow();
  });
});

describe("exam lifecycle", () => {
  it("generates a labelled demo exam and never exposes the hidden part", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const r = await ex.generateExam(db, users.alice.id, { referenceExamIds: [examPaperId], topics: ["Environment"], taskCount: 3, durationMinutes: 90 });
    expect(r.demo).toBe(true);
    examId = r.id;
    const overview = await ex.getExamOverview(db, users.alice.id, examId);
    expect(overview.view.tasks).toHaveLength(3);
    expect(overview.view.sources[0].label).toMatch(/fictional/i);
    expect(JSON.stringify(overview)).not.toMatch(/expectedContent|commonPitfalls|vocabularyTargets/);
  });

  it("refuses unconfirmed documents in a blueprint", async () => {
    const [raw] = await ex.uploadMaterials(db, users.alice.id, [{ name: "unknown.txt", bytes: enc("Klausur task 1 analyse the text") }]);
    await expect(ex.generateExam(db, users.alice.id, { referenceExamIds: [raw.id] })).rejects.toMatchObject({ status: 422 });
  });

  it("autosaves with conflict detection, locks the submission and keeps revisions as new versions", async () => {
    attemptId = (await ex.startAttempt(db, users.alice.id, examId, true)).id;
    const a0 = await ex.getAttempt(db, users.alice.id, attemptId);
    expect(a0.expectations).toBeNull();
    const saved = await ex.saveAttemptDraft(db, users.alice.id, attemptId, { answers: { "1": "The mayor wants a flood plan." }, baseVersion: 1, timing: { elapsedSeconds: 60 } });
    expect(saved.draftVersion).toBe(2);
    await expect(ex.saveAttemptDraft(db, users.alice.id, attemptId, { answers: { "1": "stale" }, baseVersion: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(ex.saveAttemptDraft(db, users.alice.id, attemptId, { answers: { "9": "x" }, baseVersion: 2 })).rejects.toMatchObject({ status: 400 });
    const v1 = await ex.submitAttempt(db, users.alice.id, attemptId, {
      answers: { "1": "The mayor argues that the town must act now. He admits the plan is not cheap.", "2": "He uses repetition and rhetorical questions. It's very persuasive.", "3": "I don't think the state should decide everything." },
      baseVersion: 2,
    });
    expect(v1).toMatchObject({ n: 1, kind: "submission" });
    await expect(ex.saveAttemptDraft(db, users.alice.id, attemptId, { answers: { "1": "late" }, baseVersion: 3 })).rejects.toMatchObject({ status: 409 });
    await expect(ex.submitAttempt(db, users.alice.id, attemptId)).rejects.toMatchObject({ status: 409 });
    const after = await ex.getAttempt(db, users.alice.id, attemptId);
    expect(after.expectations?.length).toBe(3);
    const v2 = await ex.reviseAttempt(db, users.alice.id, attemptId, { answers: { "2": "He uses repetition and rhetorical questions, which make the plan seem urgent." }, note: "after feedback" });
    expect(v2.n).toBe(2);
    expect(v2.answers["1"]).toBe(v1.answers["1"]);
    await expect(ex.reviseAttempt(db, users.alice.id, attemptId, { answers: {} })).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to submit an empty exam", async () => {
    const id = (await ex.startAttempt(db, users.alice.id, examId, false)).id;
    await expect(ex.submitAttempt(db, users.alice.id, id)).rejects.toMatchObject({ status: 400 });
  });

  it("produces an honest demo assessment that does not count as an exam result", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const a = await ex.assessAttempt(db, users.alice.id, attemptId, 1);
    expect(a.status).toBe("complete");
    expect(a.isDemo).toBe(true);
    const data = a.data as { estimate: { low: number; high: number; best: number | null }; comments: { original: string }[] };
    expect(data.estimate).toMatchObject({ low: 0, high: 15, best: null });
    expect(data.comments.map((c) => c.original)).toEqual(expect.arrayContaining(["It's", "don't"]));
    expect((await ex.assessAttempt(db, users.alice.id, attemptId, 1)).id).toBe(a.id); // idempotent
    const w = await ex.examinerWeaknesses(db, users.alice.id);
    expect(w.results).toEqual([]);
    expect(w.demoAssessments).toBe(1);
    const d = await ex.disputeComment(db, users.alice.id, a.id, { commentId: "c1", argument: "Contractions are fine in a quoted speech, I think." });
    expect(d.dispute.status).toBe("open");
    expect(d.dispute.response).toMatch(/real AI provider/);
  });

  it("rejects AI assessments with invented quotes, and accepts and tracks valid ones", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
    const usage = { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 };
    const att = await ex.getAttempt(db, users.alice.id, attemptId);
    const answers = att.versions[1].answers;
    const good = validAssessment({
      strengths: [{ task: "2", original: "make the plan seem urgent", whyStrong: "Names an effect." }],
      comments: [{ id: "c1", task: "3", original: "I don't think", problem: "Informal.", whyWeakens: "Register.", alternative: "I do not believe", whyBetter: "Formal.", category: "style", englishStatus: "valid_less_effective", severity: "minor", provenance: "teacher_explicit", dimension: "register" }],
      modelAnswer: { perTask: [{ task: "1", text: "The speaker insists that \"what is a view worth when the water is at your door?\"", whyEffective: [] }], alternativeInterpretations: [], comparisons: [] },
      weaknessObservations: [{ skill: "register_slips", present: true, severity: "minor", commentIds: ["c1"], note: "" }, { skill: "insufficient_textual_evidence", present: true, severity: "major", commentIds: [], note: "" }],
      vocabUsage: [],
    });
    const invented = structuredClone(good);
    invented.modelAnswer.perTask[0].text = 'He says "we must build a wall of steel".';
    structured.mockResolvedValue({ data: invented, usage });
    await expect(ex.assessAttempt(db, users.alice.id, attemptId, 2)).rejects.toMatchObject({ code: "invalid_output" });
    expect(structured).toHaveBeenCalledTimes(2);
    expect(structured.mock.calls[1][0].user).toMatch(/quotation not found/);
    expect((await ex.getAttempt(db, users.alice.id, attemptId)).assessments.find((x) => x.version === 2)?.status).toBe("failed");

    structured.mockReset();
    structured.mockResolvedValue({ data: good, usage });
    const done = await ex.assessAttempt(db, users.alice.id, attemptId, 2);
    expect(done.status).toBe("complete");
    expect(answers["2"]).toContain("make the plan seem urgent");
    const w = await ex.examinerWeaknesses(db, users.alice.id);
    expect(w.results).toHaveLength(1);
    expect(w.skills.find((s) => s.skill === "insufficient_textual_evidence")?.status).toBe("active");

    structured.mockReset();
    structured.mockResolvedValue({ data: { outcome: "withdrawn", response: "You are right: the register is acceptable here.", revision: null }, usage });
    const d = await ex.disputeComment(db, users.alice.id, done.id, { commentId: "c1", argument: "The task asked for an informal blog post." });
    expect(d.dispute.status).toBe("withdrawn");
    const after = await ex.getAssessment(db, users.alice.id, done.id);
    const data = after.assessment.data as { comments: { withdrawn?: boolean }[]; weaknessObservations: { skill: string; present: boolean }[] };
    expect(data.comments[0].withdrawn).toBe(true);
    expect(data.weaknessObservations.find((o) => o.skill === "register_slips")?.present).toBe(false);
  });

  it("isolates exams, attempts and assessments between users", async () => {
    await expect(ex.getExamOverview(db, users.bob.id, examId)).rejects.toMatchObject({ status: 404 });
    await expect(ex.getAttempt(db, users.bob.id, attemptId)).rejects.toMatchObject({ status: 404 });
    await expect(ex.startAttempt(db, users.bob.id, examId, true)).rejects.toMatchObject({ status: 404 });
    expect(await ex.listExams(db, users.bob.id)).toEqual([]);
  });
});

describe("lab, drills, explanations, results and export", () => {
  const usage = { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 };
  const real = () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
  };
  const labItem = (original: string) => ({
    task: "lab", original, level1Correct: "Cities should limit cars.", level2Stronger: "Cities should restrict car traffic in their centres.", level3HighLevel: null,
    explanation: { effective: "Precise verb.", nuance: "restrict vs ban", improves: ["language"], whyInContext: "Formal comment.", risks: "" },
    exercise: { instruction: "Rewrite: Cars are bad.", material: null, answerKey: null },
  });

  it("only accepts lab passages that are really in the student's text", async () => {
    real();
    structured.mockResolvedValue({ data: { items: [labItem("Cars should be gone from cities.")], overall: "Be precise." }, usage });
    await expect(ex.runLab(db, users.alice.id, { text: "I think cars are bad for cities and should go." })).rejects.toMatchObject({ code: "invalid_output" });
    structured.mockReset();
    structured.mockResolvedValue({ data: { items: [labItem("cars are bad for cities")], overall: "Be precise." }, usage });
    const r = await ex.runLab(db, users.alice.id, { text: "I think cars are bad for cities and should go." });
    expect(r.items).toHaveLength(1);
  });

  it("is honest in demo mode instead of inventing rewrites", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const r = await ex.runLab(db, users.alice.id, { text: "I think cars are bad for cities and should go." });
    expect(r).toMatchObject({ items: [], demo: true });
  });

  it("offers built-in drills for chosen skills without an AI provider", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const r = await ex.generateDrills(db, users.alice.id, ["register_slips", "grammar_errors"]);
    expect(r.drills.map((d) => d.skill)).toEqual(["register_slips", "grammar_errors"]);
    expect(r.drills[0].checklist.length).toBeGreaterThan(0);
  });

  it("explains a comment on request", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const a = (await ex.getAttempt(db, users.alice.id, attemptId)).assessments.find((x) => x.status === "complete")!;
    const r = await ex.explainComment(db, users.alice.id, a.id, "c1");
    expect(r.explanation).toMatch(/Demo mode|register|contraction/i);
    await expect(ex.explainComment(db, users.bob.id, a.id, "c1")).rejects.toMatchObject({ status: 404 });
  });

  it("lists results and exports without the original file bytes", async () => {
    const results = await ex.listAttempts(db, users.alice.id);
    expect(results.some((r) => r.id === attemptId && r.versions === 2 && r.assessments.length >= 1)).toBe(true);
    expect(await ex.listAttempts(db, users.bob.id)).toEqual([]);
    const out = await ex.exportExaminer(db, users.alice.id);
    expect(out.materials.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toContain('"type":"Buffer"');
    expect(Object.keys(out.materials[0])).not.toContain("original");
    expect(out.materials[0].originalFile).toMatch(/\/original$/);
  });

  it("saves a valid AI-generated exam and rejects one that claims to be authentic", async () => {
    real();
    const exam = {
      title: "Practice Klausur: Rural life", topic: "Rural life", examType: "Klausur", difficulty: "realistic", durationMinutes: 90, permittedResources: [], generalInstructions: "",
      sources: [{ id: "S1", title: "The Bus Stop", kind: "fictional_practice", label: "Fictional practice text written for this exam", materialId: null, lineNumbered: true, text: "Every morning the bus came later, and every morning Mia pretended not to mind. The village had shrunk around her like a coat washed too often.", citation: null }],
      tasks: [{ number: "1", type: "summary", operator: "Outline", instruction: "Outline Mia's situation in about 100 words.", sourceIds: ["S1"], expectedLength: { min: 80, max: 120, unit: "words" }, suggestedMinutes: 30, points: null }],
      marking: { origin: "none", label: "", totalPoints: null, sourceMaterialIds: [], criteria: [] },
      hidden: { taskExpectations: [{ task: "1", expectedContent: ["Mia's routine", "the shrinking village"], acceptableAlternatives: [], markingNotes: "", commonPitfalls: [] }], vocabularyTargets: [], weaknessTargets: [] },
      provenance: { formatBasedOn: [examPaperId], profileEntriesUsed: [], notes: "Format of your Schulaufgabe.", assumptions: [], conflicts: [] },
    };
    structured.mockResolvedValue({ data: exam, usage });
    const ok = await ex.generateExam(db, users.alice.id, { referenceExamIds: [examPaperId] });
    expect(ok.demo).toBe(false);
    structured.mockReset();
    const fake = structuredClone(exam);
    fake.sources[0] = { ...fake.sources[0], kind: "authentic", citation: { author: "A. Writer", title: "T", publication: "The Times", date: "2024", url: null, adapted: false, verified: true } } as never;
    structured.mockResolvedValue({ data: fake, usage });
    await expect(ex.generateExam(db, users.alice.id, { referenceExamIds: [examPaperId] })).rejects.toMatchObject({ code: "invalid_output" });
  });
});
