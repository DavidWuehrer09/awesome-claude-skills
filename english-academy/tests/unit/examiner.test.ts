import { describe, expect, it } from "vitest";
import { checkAssessment, checkExam, checkProfileEntry, type Materials } from "@/domain/examiner/checks";
import { classifyMaterial, studentView } from "@/domain/examiner/model";
import { containsQuote, quotedSpans, similarity } from "@/domain/examiner/text";
import { ANSWERS, sampleExam, SOURCE, validAssessment } from "../fixtures/examiner";
import { recommendNext, summarizeWeaknesses, weaknessStatus } from "@/domain/examiner/weaknesses";

const noMaterials: Materials = new Map();

describe("examiner text helpers", () => {
  it("matches quotes across typography, case, line breaks and ellipses", () => {
    expect(containsQuote("He said: “It’s over.”\nNobody  moved.", '"it\'s over." nobody moved')).toBe(true);
    expect(containsQuote(SOURCE, "The council ... a safer route")).toBe(true);
    expect(containsQuote(SOURCE, "a safer route ... The council")).toBe(false);
    expect(containsQuote(SOURCE, "the mayor resigned")).toBe(false);
  });
  it("finds quotations of three or more words only", () => {
    expect(quotedSpans('He used "fewer visitors would come" and "cars".')).toEqual(["fewer visitors would come"]);
  });
  it("measures word similarity", () => {
    expect(similarity("Summarise the text in about 80 words", "summarise the text in about 80 words.")).toBe(1);
    expect(similarity("Analyse the speaker's use of imagery", "Comment on the role of social media")).toBeLessThan(0.5);
  });
  it("guesses document types but asks when unsure", () => {
    expect(classifyMaterial("Bewertungsraster Englisch\nInhalt / Sprache\nGewichtung 1:1", "raster.docx").guess).toBe("rubric");
    expect(classifyMaterial("Erwartungshorizont zur 2. Schulaufgabe", "eh.pdf").guess).toBe("model_answer");
    expect(classifyMaterial("hello", "x.txt")).toEqual({ guess: "other", confidence: "low" });
  });
});

describe("profile honesty rules", () => {
  const mats: Materials = new Map([
    ["m1", { id: "m1", docType: "rubric", usable: true, text: "Sprache zählt doppelt. Use formal register throughout.", filename: "rubric.pdf" }],
    ["m2", { id: "m2", docType: "student_answer", usable: true, text: "My answer about formal register.", filename: "me.txt" }],
    ["m3", { id: "m3", docType: null, usable: false, text: "Unconfirmed", filename: "x.txt" }],
  ]);
  it("accepts a teacher requirement quoted from a teacher document", () => {
    expect(checkProfileEntry({ section: "language_expectations", statement: "Formal register", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: "m1", quote: "use formal register throughout" }] }, mats)).toEqual([]);
  });
  it("rejects invented teacher rules", () => {
    expect(checkProfileEntry({ section: "language_expectations", statement: "x", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: "m1" }] }, mats)).toHaveLength(1);
    expect(checkProfileEntry({ section: "language_expectations", statement: "x", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: "m1", quote: "grammar counts triple" }] }, mats).join()).toMatch(/not found/);
    expect(checkProfileEntry({ section: "language_expectations", statement: "x", provenance: "teacher_explicit", confidence: "confirmed", evidence: [{ materialId: "m2", quote: "formal register" }] }, mats).join()).toMatch(/cannot prove/);
  });
  it("keeps single-document patterns provisional and never 'confirmed'", () => {
    const base = { section: "task_types" as const, statement: "Comments appear", provenance: "observed_pattern" as const, evidence: [{ materialId: "m1" }] };
    expect(checkProfileEntry({ ...base, confidence: "high" }, mats).join()).toMatch(/provisional/);
    expect(checkProfileEntry({ ...base, confidence: "provisional" }, mats)).toEqual([]);
    expect(checkProfileEntry({ ...base, confidence: "confirmed", evidence: [{ materialId: "m1" }, { materialId: "m2" }] }, mats).join()).toMatch(/never “confirmed”/);
  });
  it("refuses unconfirmed documents and inferred grading criteria presented as fact", () => {
    expect(checkProfileEntry({ section: "other", statement: "x", provenance: "observed_pattern", confidence: "provisional", evidence: [{ materialId: "m3" }] }, mats).join()).toMatch(/confirm/);
    expect(checkProfileEntry({ section: "grading_criteria", statement: "Language counts double", provenance: "ai_suggestion", confidence: "low", evidence: [] }, mats).join()).toMatch(/inferred/);
  });
});

describe("exam checks", () => {
  it("accepts a well-formed exam and hides expectations from the student view", () => {
    const exam = sampleExam();
    expect(checkExam(exam, { materials: noMaterials, referenceIds: [], verifiedGuidance: false }).errors).toEqual([]);
    const view = JSON.stringify(studentView(exam));
    expect(view).not.toContain("SECRET-NOTE");
    expect(view).not.toContain("expectedContent");
    expect(view).not.toContain("to mitigate");
  });
  it("requires labels for fictional texts and verified citations for real ones", () => {
    const unlabelled = sampleExam({ sources: [{ ...sampleExam().sources[0], label: "A newspaper article" }] });
    expect(checkExam(unlabelled, { materials: noMaterials, referenceIds: [], verifiedGuidance: false }).errors.join()).toMatch(/fictional/);
    const fake = sampleExam({ sources: [{ ...sampleExam().sources[0], kind: "authentic", citation: { author: "A. Writer", title: "T", publication: "The Times", date: "2024", url: null, adapted: false, verified: false } }] });
    expect(checkExam(fake, { materials: noMaterials, referenceIds: [], verifiedGuidance: false }).errors.join()).toMatch(/verified/);
  });
  it("checks points, practice labels and hidden expectations", () => {
    const exam = sampleExam();
    exam.tasks[0].points = 10;
    exam.tasks[1].points = 20;
    exam.marking = { origin: "ai_practice", label: "AI scheme", totalPoints: 25, sourceMaterialIds: [], criteria: [] };
    exam.hidden.taskExpectations.pop();
    const errs = checkExam(exam, { materials: noMaterials, referenceIds: [], verifiedGuidance: false }).errors.join("\n");
    expect(errs).toMatch(/sum of the task points/);
    expect(errs).toMatch(/practice scheme/);
    expect(errs).toMatch(/Task 2: expectations/);
  });
  it("rejects copied reference content but allows the same format", () => {
    const ref = "Summarise the text in about 80 words.\nComment on whether cities should ban cars from their centres and give reasons for your opinion today.\n" + SOURCE;
    const materials: Materials = new Map([["r1", { id: "r1", docType: "exam_paper", usable: true, text: ref, filename: "old.pdf" }]]);
    const r = checkExam(sampleExam(), { materials, referenceIds: ["r1"], verifiedGuidance: false });
    expect(r.errors.join()).toMatch(/repeats \d+ % of its wording/);
    expect(r.warnings.join()).toMatch(/similar/);
  });
  it("warns about Abitur level without verified guidance", () => {
    expect(checkExam(sampleExam({ difficulty: "abitur" }), { materials: noMaterials, referenceIds: [], verifiedGuidance: false }).warnings.join()).toMatch(/Abitur/);
  });
});

describe("assessment checks", () => {
  const ctx = { exam: sampleExam(), answers: ANSWERS, materials: noMaterials };
  it("accepts a valid assessment", () => {
    expect(checkAssessment(validAssessment(), ctx).errors).toEqual([]);
  });
  it("rejects passages and quotations that do not exist", () => {
    const a = validAssessment();
    a.comments[0].original = "Cars are the root of all evil.";
    a.modelAnswer.perTask[0].text = 'As the author says, "cars must be banned everywhere".';
    const errs = checkAssessment(a, ctx).errors.join("\n");
    expect(errs).toMatch(/passage not found/);
    expect(errs).toMatch(/quotation not found/);
  });
  it("never 'corrects' excellent English and keeps style apart from errors", () => {
    const a = validAssessment();
    a.comments[0] = { ...a.comments[0], englishStatus: "excellent", severity: "none" };
    expect(checkAssessment(a, ctx).errors.join()).toMatch(/excellent passage/);
    const b = validAssessment();
    b.comments[0] = { ...b.comments[0], category: "language_error" };
    expect(checkAssessment(b, ctx).errors.join()).toMatch(/only for incorrect English/);
  });
  it("enforces honest estimates", () => {
    const over = validAssessment({ independent: { summary: "You will definitely get 15 points.", standardsNote: "" } });
    expect(checkAssessment(over, ctx).errors.join()).toMatch(/Over-claim/);
    const pct = validAssessment();
    pct.estimate.evidence = ["About 70 % of the content, so 10 points"];
    expect(checkAssessment(pct, ctx).errors.join()).toMatch(/Percentage-to-points/);
    const teacher = validAssessment();
    teacher.estimate.basis = "teacher_rubric";
    expect(checkAssessment(teacher, ctx).errors.join()).toMatch(/teacher basis/);
    const range = validAssessment();
    range.estimate = { ...range.estimate, low: 12, high: 9, best: 16 };
    expect(checkAssessment(range, ctx).errors.length).toBeGreaterThanOrEqual(2);
  });
  it("requires known weakness skills and comment ids", () => {
    const a = validAssessment({ weaknessObservations: [{ skill: "being_lazy", present: true, severity: "major", commentIds: ["c9"], note: "" }] });
    const errs = checkAssessment(a, ctx).errors.join();
    expect(errs).toMatch(/Unknown skill/);
    expect(errs).toMatch(/unknown comment/);
  });
});

describe("weakness tracking", () => {
  it("needs three clean attempts before calling a skill secure", () => {
    expect(weaknessStatus([{ present: true }, { present: false }])).toBe("improving");
    expect(weaknessStatus([{ present: true }, { present: false }, { present: false }, { present: false }])).toBe("secure_provisional");
    expect(weaknessStatus([{ present: true }, { present: false }, { present: true }])).toBe("recurring");
    expect(weaknessStatus([{ present: false }])).toBe("no_problem_seen_yet");
  });
  it("prioritises recent recurring problems and adapts difficulty", () => {
    const obs = (skill: string, present: boolean[], sev: "major" | "minor") => present.map((p, i) => ({ skill, assessmentId: `a${i}`, date: `2026-0${i + 1}-01`, present: p, severity: p ? sev : "none" as const, note: "" }));
    const skills = summarizeWeaknesses([...obs("insufficient_textual_evidence", [true, true, true], "major"), ...obs("spelling_punctuation", [true, false, false], "minor")]);
    const rec = recommendNext(skills, [{ low: 12, high: 14, difficulty: "realistic", version: 1 }, { low: 12, high: 13, difficulty: "realistic", version: 1 }]);
    expect(rec.focus[0].skill).toBe("insufficient_textual_evidence");
    expect(rec.difficulty).toBe("realistic"); // strong marks, but a recurring major problem blocks the step up
    const clean = recommendNext([], [{ low: 12, high: 14, difficulty: "realistic", version: 1 }, { low: 13, high: 14, difficulty: "realistic", version: 1 }]);
    expect(clean.difficulty).toBe("stretch");
    expect(recommendNext([], [{ low: 4, high: 6, difficulty: "stretch", version: 1 }, { low: 5, high: 6, difficulty: "stretch", version: 1 }]).difficulty).toBe("realistic");
    expect(recommendNext([], []).advice[0]).toMatch(/baseline/);
  });
});
