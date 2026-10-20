import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  examAssessments, examAttempts, examAttemptVersions, examCourse, examMaterials, examProfileEntries, exams, learningStates, type MaterialLabels, vocabEntries,
} from "@/db/schema";
import { checkAssessment, checkExam, checkProfileEntry, type MaterialInfo, type Materials } from "@/domain/examiner/checks";
import {
  type Assessment, assessmentSchema, type Blueprint, blueprintSchema, classifyMaterial, CONFIDENCE, DOC_TYPES, type DocType, type Exam, examSchema,
  PROFILE_SECTIONS, PROVENANCE, studentView,
} from "@/domain/examiner/model";
import { segment } from "@/domain/examiner/text";
import { recommendNext, summarizeWeaknesses, type Severity } from "@/domain/examiner/weaknesses";
import { normalizeHeadword, wordCount } from "@/lib/text";
import { type AssessInput, materializeExam, type MaterialForAI } from "../ai/examiner-features";
import { AIError, runFeature } from "../ai/service";
import { extractFile } from "../files";
import { badRequest, conflict, HttpError, notFound } from "../http";
import { log } from "../log";
import { recordWritingUse } from "./learning";

const MAX_FILES = 10;
const MAX_ANSWER_CHARS = 60_000;

// ---------------------------------------------------------------- materials

const materialColumns = {
  id: examMaterials.id, uploadSession: examMaterials.uploadSession, filename: examMaterials.filename, mediaType: examMaterials.mediaType,
  bytes: examMaterials.bytes, sha256: examMaterials.sha256, extractionMethod: examMaterials.extractionMethod, extractionStatus: examMaterials.extractionStatus,
  extractionNotes: examMaterials.extractionNotes, docType: examMaterials.docType, guess: examMaterials.guess, guessConfidence: examMaterials.guessConfidence,
  labels: examMaterials.labels, createdAt: examMaterials.createdAt, updatedAt: examMaterials.updatedAt,
};

export const labelsSchema = z.object({
  title: z.string().trim().max(120).optional(),
  topic: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  date: z.string().trim().max(20).optional(),
  examType: z.string().trim().max(60).optional(),
  yearLevel: z.string().trim().max(20).optional(),
  importance: z.enum(["low", "normal", "high", "essential"]).optional(),
});

export function isUsable(m: { docType: string | null; extractionStatus: string }) {
  return !!m.docType && m.extractionStatus === "reviewed";
}

/** Extract every file first; only then store all of them, so a bad file never leaves half an upload behind. */
export async function uploadMaterials(db: Db, userId: string, files: { name: string; bytes: Uint8Array }[], opts: { labels?: z.input<typeof labelsSchema>; docType?: DocType | null } = {}) {
  if (!files.length) throw badRequest("No files uploaded");
  if (files.length > MAX_FILES) throw badRequest(`Upload at most ${MAX_FILES} files at once`);
  const labels = labelsSchema.parse(opts.labels ?? {});
  const prepared: { f: (typeof files)[number]; text: string; cls: ReturnType<typeof classifyMaterial>; notes: string[]; method: string; mediaType: string }[] = [];
  for (const f of files) {
    let extracted;
    try {
      extracted = await extractFile(f.bytes, f.name);
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `${f.name}: ${e.message}`, e.code);
      throw e;
    }
    const text = extracted.kind === "text" ? extracted.text.replace(/\r\n/g, "\n") : "";
    const cls = classifyMaterial(text, f.name);
    prepared.push({
      f, text, cls, notes: extracted.notes,
      method: extracted.kind === "text" ? "text_layer" : extracted.kind === "image" ? "image" : "scanned_pdf",
      mediaType: extracted.kind === "image" ? extracted.mediaType : extracted.kind === "scanned_pdf" ? "application/pdf" : f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
    });
  }
  const session = `upl_${Date.now().toString(36)}`;
  const rows = await db.transaction(async (tx) => {
    const out = [];
    for (const p of prepared) {
      const [row] = await tx.insert(examMaterials).values({
        userId, uploadSession: session, filename: p.f.name.slice(0, 200), mediaType: p.mediaType, bytes: p.f.bytes.byteLength,
        sha256: createHash("sha256").update(p.f.bytes).digest("hex"), original: Buffer.from(p.f.bytes), text: p.text, originalText: p.text,
        extractionMethod: p.method, extractionStatus: p.text.trim() ? "needs_review" : "needs_transcription", extractionNotes: p.notes,
        docType: opts.docType ?? null, guess: p.cls.guess, guessConfidence: p.cls.confidence,
        labels: { topic: labels.topic ?? [], tags: labels.tags ?? [], ...labels } satisfies MaterialLabels,
      }).returning(materialColumns);
      out.push(row);
    }
    return out;
  });
  return rows;
}

export const materialFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  docType: z.enum(DOC_TYPES).optional(),
  topic: z.string().trim().max(60).optional(),
  importance: z.enum(["low", "normal", "high", "essential"]).optional(),
});

export async function listMaterials(db: Db, userId: string, filter: z.infer<typeof materialFilterSchema> = {}) {
  const rows = await db.select({ ...materialColumns, text: examMaterials.text }).from(examMaterials).where(eq(examMaterials.userId, userId)).orderBy(desc(examMaterials.createdAt));
  const firstBySha = new Map<string, string>();
  for (const r of [...rows].reverse()) if (!firstBySha.has(r.sha256)) firstBySha.set(r.sha256, r.id);
  const terms = (filter.q ?? "").toLowerCase().match(/\w[\w'-]*/g) ?? [];
  const out = [];
  for (const r of rows) {
    const type = r.docType ?? r.guess;
    if (filter.docType && type !== filter.docType) continue;
    if (filter.topic && !r.labels.topic.some((t) => t.toLowerCase().includes(filter.topic!.toLowerCase()))) continue;
    if (filter.importance && r.labels.importance !== filter.importance) continue;
    let score = 0;
    const snippets: string[] = [];
    if (terms.length) {
      const meta = `${r.filename} ${JSON.stringify(r.labels)}`.toLowerCase();
      score += terms.filter((t) => meta.includes(t)).length * 3;
      const low = r.text.toLowerCase();
      for (const t of terms) {
        let i = low.indexOf(t);
        while (i >= 0) {
          score++;
          if (snippets.length < 3) snippets.push(r.text.slice(Math.max(0, i - 80), i + t.length + 80).replace(/\s+/g, " "));
          i = low.indexOf(t, i + t.length);
        }
      }
      if (!score) continue;
    }
    const { text, ...meta } = r;
    const dup = firstBySha.get(r.sha256);
    out.push({
      ...meta, chars: text.length, segments: segment(text).length, usable: isUsable(r), score, snippets,
      duplicateOf: dup && dup !== r.id ? dup : null,
    });
  }
  return terms.length ? out.sort((a, b) => b.score - a.score) : out;
}

export async function getMaterial(db: Db, userId: string, id: string) {
  const [m] = await db.select({ ...materialColumns, text: examMaterials.text, originalText: examMaterials.originalText, textHistory: examMaterials.textHistory })
    .from(examMaterials).where(and(eq(examMaterials.userId, userId), eq(examMaterials.id, id)));
  if (!m) throw notFound("Document not found");
  return { ...m, usable: isUsable(m) };
}

export async function getMaterialOriginal(db: Db, userId: string, id: string) {
  const [m] = await db.select({ original: examMaterials.original, mediaType: examMaterials.mediaType, filename: examMaterials.filename })
    .from(examMaterials).where(and(eq(examMaterials.userId, userId), eq(examMaterials.id, id)));
  if (!m?.original) throw notFound("Original file not found");
  return m;
}

export const materialPatchSchema = z.object({
  text: z.string().max(400_000).optional(),
  note: z.string().trim().max(200).optional(),
  docType: z.enum(DOC_TYPES).optional(),
  labels: labelsSchema.optional(),
  reviewed: z.literal(true).optional(),
});

export async function updateMaterial(db: Db, userId: string, id: string, patch: z.input<typeof materialPatchSchema>) {
  const p = materialPatchSchema.parse(patch);
  const cur = await getMaterial(db, userId, id);
  const set: Partial<typeof examMaterials.$inferInsert> = { updatedAt: new Date() };
  if (p.text !== undefined && p.text !== cur.text) {
    set.textHistory = [...cur.textHistory, { version: cur.textHistory.length + 1, at: new Date().toISOString(), note: p.note ?? "your correction", text: cur.text }].slice(-20);
    set.text = p.text.replace(/\r\n/g, "\n");
    set.extractionStatus = p.text.trim() ? "reviewed" : "needs_transcription";
  }
  if (p.reviewed) {
    if (!(set.text ?? cur.text).trim()) throw badRequest("There is no text yet: transcribe the document first");
    set.extractionStatus = "reviewed";
  }
  if (p.docType) set.docType = p.docType;
  if (p.labels) set.labels = { ...cur.labels, ...p.labels, topic: p.labels.topic ?? cur.labels.topic, tags: p.labels.tags ?? cur.labels.tags };
  await db.update(examMaterials).set(set).where(and(eq(examMaterials.userId, userId), eq(examMaterials.id, id)));
  return getMaterial(db, userId, id);
}

/** OCR for photos and scanned PDFs via a vision-capable model. The result still needs the learner's review. */
export async function transcribeMaterial(db: Db, userId: string, id: string) {
  const m = await getMaterialOriginal(db, userId, id);
  const base64 = Buffer.from(m.original!).toString("base64");
  const input = m.mediaType === "application/pdf"
    ? { filename: m.filename, pdfBase64: base64 }
    : { filename: m.filename, images: [{ mediaType: m.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", base64 }] };
  const { data, meta } = await runFeature(db, userId, "examTranscribe", input);
  const cur = await getMaterial(db, userId, id);
  const cls = classifyMaterial(data.text, cur.filename);
  await db.update(examMaterials).set({
    text: data.text, originalText: cur.originalText || data.text, extractionStatus: "needs_review", extractionMethod: `ai_transcription:${meta.model}`,
    extractionNotes: [...cur.extractionNotes, ...data.notes, ...data.unreadable.map((u) => `Unreadable: ${u}`), "Transcribed by AI: compare every line with the original."],
    textHistory: cur.text ? [...cur.textHistory, { version: cur.textHistory.length + 1, at: new Date().toISOString(), note: "before AI transcription", text: cur.text }] : cur.textHistory,
    guess: cls.guess, guessConfidence: cls.confidence, updatedAt: new Date(),
  }).where(and(eq(examMaterials.userId, userId), eq(examMaterials.id, id)));
  return getMaterial(db, userId, id);
}

export async function deleteMaterial(db: Db, userId: string, id: string) {
  const r = await db.delete(examMaterials).where(and(eq(examMaterials.userId, userId), eq(examMaterials.id, id))).returning({ id: examMaterials.id });
  if (!r.length) throw notFound("Document not found");
}

async function materialInfos(db: Db, userId: string, ids?: string[]): Promise<Materials> {
  if (ids && !ids.length) return new Map();
  const rows = await db.select({ id: examMaterials.id, docType: examMaterials.docType, extractionStatus: examMaterials.extractionStatus, text: examMaterials.text, filename: examMaterials.filename })
    .from(examMaterials).where(and(eq(examMaterials.userId, userId), ...(ids ? [inArray(examMaterials.id, ids)] : [])));
  return new Map(rows.map((r) => [r.id, { id: r.id, docType: r.docType as DocType | null, usable: isUsable(r), text: r.text, filename: r.filename } satisfies MaterialInfo]));
}

const forAI = (m: MaterialInfo): MaterialForAI => ({ ...m });

// ---------------------------------------------------------------- course profile

export const profileEntrySchema = z.object({
  section: z.enum(PROFILE_SECTIONS),
  statement: z.string().trim().min(3).max(600),
  provenance: z.enum(PROVENANCE),
  confidence: z.enum(CONFIDENCE),
  evidence: z.array(z.object({
    materialId: z.string().uuid().nullish(),
    quote: z.string().trim().max(600).nullish(),
    location: z.string().trim().max(100).nullish(),
    url: z.string().trim().url().max(500).refine((u) => /^https?:/i.test(u), "Only http(s) links").nullish(),
  })).max(10).default([]),
});

export async function getProfile(db: Db, userId: string) {
  const [entries, [course], materials] = await Promise.all([
    db.select().from(examProfileEntries).where(eq(examProfileEntries.userId, userId)).orderBy(asc(examProfileEntries.createdAt)),
    db.select().from(examCourse).where(eq(examCourse.userId, userId)),
    materialInfos(db, userId),
  ]);
  // Re-check every entry: documents may have been edited or deleted since.
  const checked = entries.map((e) => ({ ...e, problems: checkProfileEntry({ ...e, section: e.section as never, provenance: e.provenance as never, confidence: e.confidence as never }, materials) }));
  const examPapers = [...materials.values()].filter((m) => m.docType === "exam_paper").length;
  const notes = examPapers < 2 ? [`Only ${examPapers} confirmed exam paper${examPapers === 1 ? "" : "s"}: every pattern about your teacher's exams is provisional.`] : [];
  return { entries: checked, course: course ?? { userId, yearLevel: null, courseLevel: null, preferredFormat: null, officialGuidance: [], updatedAt: null }, notes, confirmedExamPapers: examPapers };
}

/** Validate all entries first, then add all of them or none. */
export async function addProfileEntries(db: Db, userId: string, input: z.input<typeof profileEntrySchema>[]) {
  const entries = z.array(profileEntrySchema).min(1).max(30).parse(input);
  const materials = await materialInfos(db, userId);
  const problems = entries.flatMap((e, i) => checkProfileEntry(e, materials).map((p) => `Entry ${i + 1} (“${e.statement.slice(0, 40)}”): ${p}`));
  if (problems.length) throw new HttpError(422, "Profile entries rejected; nothing was added.", "honesty_check", problems);
  return db.insert(examProfileEntries).values(entries.map((e) => ({ userId, ...e, evidence: e.evidence.map((ev) => ({ materialId: ev.materialId ?? undefined, quote: ev.quote ?? undefined, location: ev.location ?? undefined, url: ev.url ?? undefined })) }))).returning();
}

export async function updateProfileEntry(db: Db, userId: string, id: string, input: z.input<typeof profileEntrySchema>) {
  const e = profileEntrySchema.parse(input);
  const problems = checkProfileEntry(e, await materialInfos(db, userId));
  if (problems.length) throw new HttpError(422, "Change rejected.", "honesty_check", problems);
  const [row] = await db.update(examProfileEntries).set({ ...e, evidence: e.evidence.map((ev) => ({ materialId: ev.materialId ?? undefined, quote: ev.quote ?? undefined, location: ev.location ?? undefined, url: ev.url ?? undefined })), userEdited: true, updatedAt: new Date() })
    .where(and(eq(examProfileEntries.userId, userId), eq(examProfileEntries.id, id))).returning();
  if (!row) throw notFound("Profile entry not found");
  return row;
}

export async function deleteProfileEntry(db: Db, userId: string, id: string) {
  const r = await db.delete(examProfileEntries).where(and(eq(examProfileEntries.userId, userId), eq(examProfileEntries.id, id))).returning({ id: examProfileEntries.id });
  if (!r.length) throw notFound("Profile entry not found");
}

export const courseSchema = z.object({
  yearLevel: z.string().trim().max(20).nullish(),
  courseLevel: z.string().trim().max(60).nullish(),
  preferredFormat: z.string().trim().max(200).nullish(),
  addGuidance: z.object({ title: z.string().trim().min(3).max(200), url: z.string().trim().url().refine((u) => /^https?:/i.test(u)), summary: z.string().trim().max(1000), verified: z.boolean() }).optional(),
  removeGuidance: z.number().int().min(0).optional(),
});

export async function updateCourse(db: Db, userId: string, input: z.input<typeof courseSchema>) {
  const p = courseSchema.parse(input);
  const { course } = await getProfile(db, userId);
  let guidance = course.officialGuidance;
  if (p.addGuidance) guidance = [...guidance, { ...p.addGuidance, checked: new Date().toISOString() }].slice(-20);
  if (p.removeGuidance !== undefined) guidance = guidance.filter((_, i) => i !== p.removeGuidance);
  const values = {
    yearLevel: p.yearLevel !== undefined ? p.yearLevel : course.yearLevel,
    courseLevel: p.courseLevel !== undefined ? p.courseLevel : course.courseLevel,
    preferredFormat: p.preferredFormat !== undefined ? p.preferredFormat : course.preferredFormat,
    officialGuidance: guidance, updatedAt: new Date(),
  };
  await db.insert(examCourse).values({ userId, ...values }).onConflictDoUpdate({ target: examCourse.userId, set: values });
  return (await getProfile(db, userId)).course;
}

/** AI (or demo rules) propose entries from confirmed documents; nothing is saved until the learner accepts them. */
export async function suggestProfile(db: Db, userId: string) {
  const materials = [...(await materialInfos(db, userId)).values()].filter((m) => m.usable);
  if (!materials.length) throw badRequest("Confirm and review at least one document first");
  const existing = (await db.select({ s: examProfileEntries.statement }).from(examProfileEntries).where(eq(examProfileEntries.userId, userId))).map((r) => r.s);
  const { data, meta } = await runFeature(db, userId, "examProfileSuggest", { materials: materials.map(forAI), existing });
  return { ...data, demo: meta.demo };
}

// ---------------------------------------------------------------- exams

async function weakVocabulary(db: Db, userId: string) {
  const rows = await db.select({ headword: vocabEntries.headword }).from(learningStates)
    .innerJoin(vocabEntries, eq(vocabEntries.id, learningStates.entryId))
    .where(and(eq(learningStates.userId, userId), ne(learningStates.state, 0)))
    .orderBy(asc(learningStates.stability)).limit(12);
  return rows.map((r) => r.headword);
}

export async function generateExam(db: Db, userId: string, input: z.input<typeof blueprintSchema>) {
  const bp: Blueprint = blueprintSchema.parse(input);
  const refIds = [...new Set([...bp.referenceExamIds, ...(bp.followReferenceClosely ? [bp.followReferenceClosely] : [])])];
  const materials = await materialInfos(db, userId, [...refIds, ...bp.sourceMaterialIds]);
  const problems: string[] = [];
  for (const id of [...refIds, ...bp.sourceMaterialIds]) {
    const m = materials.get(id);
    if (!m) problems.push("A selected document no longer exists.");
    else if (!m.usable) problems.push(`“${m.filename}” must be confirmed and reviewed before it can be used.`);
  }
  for (const id of refIds) if (materials.get(id) && materials.get(id)!.docType !== "exam_paper") problems.push(`“${materials.get(id)!.filename}” is not confirmed as an exam paper.`);
  if (bp.followReferenceClosely && !bp.referenceExamIds.includes(bp.followReferenceClosely)) problems.push("The exam to follow closely must be one of the reference exams.");
  if (problems.length) throw new HttpError(422, "The exam blueprint has problems.", "blueprint", problems);

  const profile = await getProfile(db, userId);
  const verifiedGuidance = profile.course.officialGuidance.some((g) => g.verified);
  const w = await examinerWeaknesses(db, userId);
  const refs = refIds.map((id) => forAI(materials.get(id)!));
  const sources = bp.sourceMaterialIds.map((id) => forAI(materials.get(id)!));
  const { data, meta } = await runFeature(db, userId, "examGenerate", {
    blueprint: bp,
    profile: bp.matchTeacherFormat ? profile.entries.filter((e) => !e.problems.length).map((e) => ({ statement: e.statement, provenance: e.provenance, confidence: e.confidence })) : [],
    focusSkills: bp.focusWeaknesses ? w.recommendation.focus.map((f) => f.skill) : [],
    vocabulary: bp.includeVocabulary ? await weakVocabulary(db, userId) : [],
    references: refs, sources, verifiedGuidance,
  });
  const exam = materializeExam(examSchema.parse(data), materials);
  const result = checkExam(exam, { materials, referenceIds: refIds, verifiedGuidance });
  if (result.errors.length) throw new HttpError(422, "The generated exam failed the originality and honesty checks; nothing was saved.", "exam_check", result.errors);
  const [row] = await db.insert(exams).values({
    userId, title: exam.title.slice(0, 200), difficulty: exam.difficulty, blueprint: bp as unknown as Record<string, unknown>,
    exam: exam as unknown as Record<string, unknown>, validation: { warnings: result.warnings, originality: result.originality }, isDemo: meta.demo,
  }).returning({ id: exams.id });
  return { id: row.id, warnings: result.warnings, demo: meta.demo };
}

async function loadExam(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(exams).where(and(eq(exams.userId, userId), eq(exams.id, id)));
  if (!row) throw notFound("Exam not found");
  return { row, exam: row.exam as unknown as Exam };
}

export async function listExams(db: Db, userId: string) {
  const rows = await db.select({ id: exams.id, title: exams.title, difficulty: exams.difficulty, isDemo: exams.isDemo, createdAt: exams.createdAt, exam: exams.exam })
    .from(exams).where(eq(exams.userId, userId)).orderBy(desc(exams.createdAt));
  const attempts = await db.select({ id: examAttempts.id, examId: examAttempts.examId, status: examAttempts.status, createdAt: examAttempts.createdAt })
    .from(examAttempts).where(eq(examAttempts.userId, userId)).orderBy(desc(examAttempts.createdAt));
  return rows.map(({ exam, ...r }) => {
    const e = exam as unknown as Exam;
    return { ...r, topic: e.topic, examType: e.examType, durationMinutes: e.durationMinutes, tasks: e.tasks.length, attempts: attempts.filter((a) => a.examId === r.id) };
  });
}

/** Exam overview before starting: the student view plus how it was made. Hidden expectations are never included. */
export async function getExamOverview(db: Db, userId: string, id: string) {
  const { row, exam } = await loadExam(db, userId, id);
  return {
    id: row.id, isDemo: row.isDemo, createdAt: row.createdAt, view: studentView(exam), validation: row.validation,
    provenance: { notes: exam.provenance.notes, assumptions: exam.provenance.assumptions, formatBasedOn: exam.provenance.formatBasedOn.length },
    markingOrigin: exam.marking.origin,
  };
}

export async function deleteExam(db: Db, userId: string, id: string) {
  const r = await db.delete(exams).where(and(eq(exams.userId, userId), eq(exams.id, id))).returning({ id: exams.id });
  if (!r.length) throw notFound("Exam not found");
}

// ---------------------------------------------------------------- attempts

export async function startAttempt(db: Db, userId: string, examId: string, timed: boolean) {
  const { exam } = await loadExam(db, userId, examId);
  const [a] = await db.insert(examAttempts).values({
    userId, examId, timed, draft: Object.fromEntries(exam.tasks.map((t) => [t.number, ""])), timing: { startedAt: new Date().toISOString(), elapsedSeconds: 0, pausedSeconds: 0, pauses: 0 },
  }).returning({ id: examAttempts.id });
  return a;
}

async function loadAttempt(db: Db, userId: string, id: string) {
  const [a] = await db.select().from(examAttempts).where(and(eq(examAttempts.userId, userId), eq(examAttempts.id, id)));
  if (!a) throw notFound("Attempt not found");
  return a;
}

export async function getAttempt(db: Db, userId: string, id: string) {
  const a = await loadAttempt(db, userId, id);
  const { row, exam } = await loadExam(db, userId, a.examId);
  const versions = await db.select().from(examAttemptVersions).where(eq(examAttemptVersions.attemptId, id)).orderBy(asc(examAttemptVersions.n));
  const assessments = await db.select({ id: examAssessments.id, version: examAssessments.version, status: examAssessments.status, isDemo: examAssessments.isDemo, error: examAssessments.error, createdAt: examAssessments.createdAt })
    .from(examAssessments).where(eq(examAssessments.attemptId, id)).orderBy(asc(examAssessments.version));
  return {
    attempt: a, examId: row.id, isDemo: row.isDemo, view: studentView(exam), versions, assessments,
    // Expectations are revealed only after the attempt is submitted.
    expectations: a.status === "submitted" ? exam.hidden.taskExpectations : null,
  };
}

const answersSchema = z.record(z.string().max(10), z.string().max(MAX_ANSWER_CHARS));
const timingSchema = z.object({ elapsedSeconds: z.number().int().min(0).max(86400), pausedSeconds: z.number().int().min(0).max(86400), pauses: z.number().int().min(0).max(1000), overtimeSeconds: z.number().int().min(0).max(86400) }).partial();

export const draftSchema = z.object({ answers: answersSchema, timing: timingSchema.optional(), baseVersion: z.number().int().min(1) });

function cleanAnswers(exam: Exam, answers: Record<string, string>) {
  const numbers = new Set(exam.tasks.map((t) => t.number));
  const unknown = Object.keys(answers).filter((k) => !numbers.has(k));
  if (unknown.length) throw badRequest(`Answers for unknown task(s): ${unknown.join(", ")}`);
  return Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.replace(/\r\n/g, "\n")]));
}

/** Autosave with optimistic concurrency, like Writing Lab drafts. */
export async function saveAttemptDraft(db: Db, userId: string, id: string, input: z.input<typeof draftSchema>) {
  const p = draftSchema.parse(input);
  const a = await loadAttempt(db, userId, id);
  if (a.status !== "in_progress") throw conflict("This attempt is already submitted. Revise it to create a new version.");
  if (a.draftVersion !== p.baseVersion) throw conflict("This exam was saved on another device", { draft: a.draft, draftVersion: a.draftVersion });
  const { exam } = await loadExam(db, userId, a.examId);
  const [row] = await db.update(examAttempts).set({
    draft: { ...a.draft, ...cleanAnswers(exam, p.answers) }, timing: { ...a.timing, ...p.timing }, draftVersion: a.draftVersion + 1,
  }).where(and(eq(examAttempts.id, id), eq(examAttempts.draftVersion, p.baseVersion))).returning({ draftVersion: examAttempts.draftVersion });
  if (!row) throw conflict("This exam was saved on another device", { draft: a.draft, draftVersion: a.draftVersion });
  return row;
}

async function writeVersion(db: Db, userId: string, attemptId: string, kind: "submission" | "revision", answers: Record<string, string>, note: string) {
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${examAttemptVersions.n}), 0)::int` }).from(examAttemptVersions).where(eq(examAttemptVersions.attemptId, attemptId));
  const [v] = await db.insert(examAttemptVersions).values({
    userId, attemptId, n: n + 1, kind, note, answers, wordCounts: Object.fromEntries(Object.entries(answers).map(([k, t]) => [k, wordCount(t)])),
  }).returning();
  return v;
}

/** Lock the answers as version 1. Versions are never overwritten. */
export async function submitAttempt(db: Db, userId: string, id: string, input?: z.input<typeof draftSchema>) {
  if (input) await saveAttemptDraft(db, userId, id, input);
  const a = await loadAttempt(db, userId, id);
  if (a.status !== "in_progress") throw conflict("This attempt is already submitted");
  if (!Object.values(a.draft).some((v) => v.trim())) throw badRequest("Nothing to submit: every answer is empty");
  return db.transaction(async (tx) => {
    const [locked] = await tx.update(examAttempts).set({ status: "submitted", submittedAt: new Date() })
      .where(and(eq(examAttempts.id, id), eq(examAttempts.status, "in_progress"))).returning({ id: examAttempts.id });
    if (!locked) throw conflict("This attempt is already submitted");
    return writeVersion(tx as unknown as Db, userId, id, "submission", a.draft, "Original submission (locked)");
  });
}

export const reviseSchema = z.object({ answers: answersSchema, note: z.string().trim().max(200).default("Revision") });

export async function reviseAttempt(db: Db, userId: string, id: string, input: z.input<typeof reviseSchema>) {
  const p = reviseSchema.parse(input);
  const a = await loadAttempt(db, userId, id);
  if (a.status !== "submitted") throw badRequest("Submit the exam before revising it");
  const { exam } = await loadExam(db, userId, a.examId);
  const [latest] = await db.select().from(examAttemptVersions).where(eq(examAttemptVersions.attemptId, id)).orderBy(desc(examAttemptVersions.n)).limit(1);
  const merged = { ...latest.answers, ...cleanAnswers(exam, p.answers) };
  if (JSON.stringify(merged) === JSON.stringify(latest.answers)) throw badRequest("Nothing changed compared with the latest version");
  return writeVersion(db, userId, id, "revision", merged, p.note);
}

// ---------------------------------------------------------------- assessments

export async function assessAttempt(db: Db, userId: string, attemptId: string, versionNo?: number) {
  const a = await loadAttempt(db, userId, attemptId);
  const versions = await db.select().from(examAttemptVersions).where(eq(examAttemptVersions.attemptId, attemptId)).orderBy(asc(examAttemptVersions.n));
  if (!versions.length) throw badRequest("Submit the exam before asking for an assessment");
  const v = versionNo ? versions.find((x) => x.n === versionNo) : versions[versions.length - 1];
  if (!v) throw notFound("Version not found");
  const [existing] = await db.select().from(examAssessments).where(and(eq(examAssessments.attemptId, attemptId), eq(examAssessments.version, v.n)));
  if (existing?.status === "complete") return existing;
  if (existing?.status === "pending" && Date.now() - existing.createdAt.getTime() < 5 * 60000) throw conflict("An assessment is already running for this version");
  const row = existing ?? (await db.insert(examAssessments).values({ userId, attemptId, version: v.n, status: "pending" }).onConflictDoNothing().returning())[0];
  if (!row) throw conflict("An assessment is already running for this version");
  if (existing) await db.update(examAssessments).set({ status: "pending", error: null, createdAt: new Date() }).where(eq(examAssessments.id, row.id));

  try {
    const { exam } = await loadExam(db, userId, a.examId);
    const materials = await materialInfos(db, userId);
    const profile = await getProfile(db, userId);
    const rubrics = [...materials.values()].filter((m) => m.usable && (m.docType === "rubric" || m.docType === "model_answer" || m.docType === "teacher_correction"));
    const prevRow = v.n > 1
      ? (await db.select().from(examAssessments).where(and(eq(examAssessments.attemptId, attemptId), eq(examAssessments.status, "complete"))).orderBy(desc(examAssessments.version)))
        .find((x) => x.version < v.n)
      : undefined;
    const prev = prevRow?.data as unknown as Assessment | undefined;
    const input: AssessInput = {
      exam, answers: v.answers, version: v.n,
      previous: prev && prevRow ? { version: prevRow.version, estimate: prev.estimate, topComments: prev.comments.filter((c) => !c.withdrawn && c.severity !== "minor").slice(0, 6).map((c) => c.problem) } : null,
      profile: profile.entries.filter((e) => !e.problems.length).map((e) => ({ statement: e.statement, provenance: e.provenance, confidence: e.confidence })),
      rubrics: rubrics.map(forAI), materials: [...materials.values()].map(forAI), unhelpful: await unhelpfulHistory(db, userId),
    };
    const { data, meta } = await runFeature(db, userId, "examAssess", input);
    const assessment = assessmentSchema.parse(data) as Assessment;
    const check = checkAssessment(assessment, { exam, answers: v.answers, materials });
    if (check.errors.length) throw new HttpError(422, "The assessment failed the honesty checks and was not saved.", "assessment_check", check.errors);
    const [done] = await db.update(examAssessments).set({
      status: "complete", data: { ...assessment, validationWarnings: check.warnings } as unknown as Record<string, unknown>, provider: meta.provider, promptVersion: meta.promptVersion,
      isDemo: meta.demo, error: null,
    }).where(eq(examAssessments.id, row.id)).returning();
    if (!meta.demo) await recordVocabUsage(db, userId, assessment.vocabUsage);
    return done;
  } catch (e) {
    const message = e instanceof AIError || e instanceof HttpError ? e.message : "The assessment failed.";
    await db.update(examAssessments).set({ status: "failed", error: message }).where(eq(examAssessments.id, row.id));
    if (!(e instanceof AIError || e instanceof HttpError)) log.error("exam_assess_failed", { error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Target words used in the exam count as evidence of use in writing (natural use = success). */
async function recordVocabUsage(db: Db, userId: string, usage: Assessment["vocabUsage"]) {
  const used = usage.filter((u) => u.used);
  if (!used.length) return;
  const entries = await db.select({ id: vocabEntries.id, normalized: vocabEntries.normalized }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const byNorm = new Map(entries.map((e) => [e.normalized, e.id]));
  for (const u of used) {
    const id = byNorm.get(normalizeHeadword(u.term));
    if (id) await recordWritingUse(db, userId, id, u.natural === false ? 0.5 : u.natural ? 1 : 0.75);
  }
}

async function unhelpfulHistory(db: Db, userId: string) {
  const rows = await db.select({ data: examAssessments.data, unhelpful: examAssessments.unhelpful }).from(examAssessments)
    .where(and(eq(examAssessments.userId, userId), eq(examAssessments.status, "complete")));
  return rows.flatMap((r) => r.unhelpful.map((u) => ({
    comment: ((r.data as unknown as Assessment | null)?.comments.find((c) => c.id === u.commentId)?.problem ?? "").slice(0, 200), reason: u.reason,
  }))).slice(-20);
}

export async function getAssessment(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(examAssessments).where(and(eq(examAssessments.userId, userId), eq(examAssessments.id, id)));
  if (!row) throw notFound("Assessment not found");
  const a = await loadAttempt(db, userId, row.attemptId);
  const { row: examRow, exam } = await loadExam(db, userId, a.examId);
  const versions = await db.select().from(examAttemptVersions).where(eq(examAttemptVersions.attemptId, a.id)).orderBy(asc(examAttemptVersions.n));
  const others = await db.select({ id: examAssessments.id, version: examAssessments.version, status: examAssessments.status, data: examAssessments.data })
    .from(examAssessments).where(eq(examAssessments.attemptId, a.id)).orderBy(asc(examAssessments.version));
  return {
    assessment: row, attemptId: a.id, examId: examRow.id, examTitle: exam.title, isDemoExam: examRow.isDemo,
    view: studentView(exam), expectations: exam.hidden.taskExpectations, vocabularyTargets: exam.hidden.vocabularyTargets,
    version: versions.find((v) => v.n === row.version) ?? null, versions,
    history: others.map((o) => ({ id: o.id, version: o.version, status: o.status, estimate: (o.data as unknown as Assessment | null)?.estimate ?? null })),
  };
}

export const disputeSchema = z.object({ commentId: z.string().min(1).max(20), argument: z.string().trim().min(10).max(3000) });

export async function disputeComment(db: Db, userId: string, assessmentId: string, input: z.input<typeof disputeSchema>) {
  const p = disputeSchema.parse(input);
  const { assessment: row, view } = await getAssessment(db, userId, assessmentId);
  if (row.status !== "complete") throw badRequest("This assessment is not complete");
  const data = row.data as unknown as Assessment;
  const comment = data.comments.find((c) => c.id === p.commentId);
  if (!comment) throw notFound("Comment not found");
  if (comment.withdrawn) throw badRequest("This comment was already withdrawn");
  const dispute: (typeof row.disputes)[number] = { id: randomUUID().slice(0, 8), commentId: p.commentId, argument: p.argument, status: "open", at: new Date().toISOString() };
  const save = (disputes: typeof row.disputes, next?: Assessment) =>
    db.update(examAssessments).set({ disputes, ...(next ? { data: next as unknown as Record<string, unknown> } : {}) }).where(eq(examAssessments.id, row.id));
  await save([...row.disputes, dispute]);

  const a = await loadAttempt(db, userId, row.attemptId);
  const { exam } = await loadExam(db, userId, a.examId);
  const [version] = await db.select().from(examAttemptVersions).where(and(eq(examAttemptVersions.attemptId, a.id), eq(examAttemptVersions.n, row.version)));
  let result;
  try {
    result = (await runFeature(db, userId, "examDispute", {
      comment, argument: p.argument, answer: version?.answers[comment.task] ?? "", task: exam.tasks.find((t) => t.number === comment.task),
      sources: view.sources.map((s) => s.text).join("\n\n"),
    })).data;
  } catch (e) {
    if (e instanceof AIError) {
      const open = { ...dispute, response: e.code === "disabled" ? "Recorded. Reconsidering a comment needs a real AI provider; until then you can mark the comment as unhelpful." : e.message };
      await save([...row.disputes, open]);
      return { dispute: open };
    }
    throw e;
  }
  const next: Assessment = structuredClone(data);
  const target = next.comments.find((c) => c.id === p.commentId)!;
  if (result.outcome === "revised" && result.revision) {
    target.history = [...(target.history ?? []), { ...comment, history: undefined }];
    Object.assign(target, result.revision);
  } else if (result.outcome === "withdrawn") {
    target.withdrawn = true;
    for (const w of next.weaknessObservations) {
      if (w.commentIds.includes(target.id)) {
        w.commentIds = w.commentIds.filter((c) => c !== target.id);
        if (!w.commentIds.length) {
          w.present = false;
          w.severity = "none";
        }
      }
    }
  }
  const outcome = result.outcome === "revised" && !result.revision ? "upheld" : result.outcome;
  if (outcome === "revised") {
    const materials = await materialInfos(db, userId);
    const check = checkAssessment({ ...next, comments: next.comments.filter((c) => !c.withdrawn) }, { exam, answers: version?.answers ?? {}, materials });
    if (check.errors.length) {
      const open = { ...dispute, response: "The reconsidered comment did not pass the honesty checks, so the original stays for now." };
      await save([...row.disputes, open]);
      return { dispute: open };
    }
  }
  const resolved = { ...dispute, status: outcome, response: result.response };
  await save([...row.disputes, resolved], outcome === "upheld" ? undefined : next);
  return { dispute: resolved };
}

export const unhelpfulSchema = z.object({ commentId: z.string().min(1).max(20), reason: z.string().trim().min(3).max(500) });

export async function markUnhelpful(db: Db, userId: string, assessmentId: string, input: z.input<typeof unhelpfulSchema>) {
  const p = unhelpfulSchema.parse(input);
  const [row] = await db.select().from(examAssessments).where(and(eq(examAssessments.userId, userId), eq(examAssessments.id, assessmentId)));
  if (!row) throw notFound("Assessment not found");
  if (!(row.data as unknown as Assessment | null)?.comments.some((c) => c.id === p.commentId)) throw notFound("Comment not found");
  await db.update(examAssessments).set({ unhelpful: [...row.unhelpful, { ...p, at: new Date().toISOString() }] }).where(eq(examAssessments.id, row.id));
  return { ok: true };
}

// ---------------------------------------------------------------- weaknesses and progress

export async function examinerWeaknesses(db: Db, userId: string) {
  const rows = await db.select({ id: examAssessments.id, version: examAssessments.version, createdAt: examAssessments.createdAt, data: examAssessments.data, isDemo: examAssessments.isDemo, examId: examAttempts.examId, difficulty: exams.difficulty, title: exams.title })
    .from(examAssessments).innerJoin(examAttempts, eq(examAttempts.id, examAssessments.attemptId)).innerJoin(exams, eq(exams.id, examAttempts.examId))
    .where(and(eq(examAssessments.userId, userId), eq(examAssessments.status, "complete"))).orderBy(asc(examAssessments.createdAt));
  // Demo assessments contain only mechanical checks; they do not count as exam results.
  const real = rows.filter((r) => !r.isDemo);
  const observations = real.flatMap((r) => (r.data as unknown as Assessment).weaknessObservations.map((o) => ({
    skill: o.skill, assessmentId: r.id, date: r.createdAt.toISOString(), present: o.present, severity: (o.present ? o.severity : "none") as Severity, note: o.note,
  })));
  const skills = summarizeWeaknesses(observations);
  const results = real.map((r) => {
    const e = (r.data as unknown as Assessment).estimate;
    return { id: r.id, title: r.title, date: r.createdAt.toISOString(), version: r.version, low: e.low, high: e.high, best: e.best, basis: e.basis, difficulty: r.difficulty as Blueprint["difficulty"] };
  });
  return { skills, results, recommendation: recommendNext(skills, results), demoAssessments: rows.length - real.length };
}
