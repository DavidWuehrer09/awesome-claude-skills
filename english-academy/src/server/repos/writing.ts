import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  feedbackResponses,
  vocabEntries,
  writingAssessments,
  writingDrafts,
  writingErrorPatterns,
  writingPrompts,
  writingSubmissions,
} from "@/db/schema";
import { LIBRARY, SENTENCE_LAB } from "@/domain/writing/library";
import { nextRevisit, normalizeCategory, rubricNote } from "@/domain/writing/rubrics";
import { inflectionPattern, normalizeHeadword, wordCount } from "@/lib/text";
import { AIError, runFeature } from "../ai/service";
import { badRequest, conflict, notFound } from "../http";
import { recordWritingUse } from "./learning";

export const promptCreateSchema = z.discriminatedUnion("origin", [
  z.object({ origin: z.literal("library"), key: z.string(), targetEntryIds: z.array(z.string().uuid()).max(12).optional() }),
  z.object({ origin: z.literal("lab"), key: z.string() }),
  z.object({
    origin: z.literal("ai"),
    section: z.string().max(30),
    taskType: z.string().max(40),
    topic: z.string().trim().min(2).max(120),
    difficulty: z.enum(["B2", "C1", "C2"]).default("C1"),
    minutes: z.number().int().min(5).max(300).nullish(),
    /** Desired length in words; the stored word range is ±10% of it. */
    targetLength: z.number().int().min(20).max(1500).nullish(),
    targetEntryIds: z.array(z.string().uuid()).max(12).optional(),
  }),
  z.object({
    origin: z.literal("user"),
    section: z.string().max(30),
    taskType: z.string().max(40),
    title: z.string().trim().min(2).max(160),
    instructions: z.string().trim().min(5).max(4000),
    sourceText: z.string().max(20000).nullish(),
    answerKey: z.string().max(4000).nullish(),
    minWords: z.number().int().min(10).max(3000).nullish(),
    maxWords: z.number().int().min(10).max(3000).nullish(),
    timeLimitMinutes: z.number().int().min(5).max(300).nullish(),
    targetEntryIds: z.array(z.string().uuid()).max(12).optional(),
  }),
]);

async function targetWordsFor(db: Db, userId: string, ids: string[] | undefined) {
  if (!ids?.length) return { ids: [], words: [] as string[] };
  const rows = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword }).from(vocabEntries)
    .where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, ids)));
  return { ids: rows.map((r) => r.id), words: rows.map((r) => r.headword) };
}

export async function createPrompt(db: Db, userId: string, input: z.input<typeof promptCreateSchema>) {
  const data = promptCreateSchema.parse(input);
  if (data.origin === "lab") {
    const l = SENTENCE_LAB.find((x) => x.key === data.key);
    if (!l) throw notFound("Exercise not found");
    const [row] = await db.insert(writingPrompts).values({
      userId, section: "sentence", taskType: "sentence", title: `Sentence Lab: ${l.focus}`,
      instructions: `Rewrite the sentence to improve it (${l.focus.toLowerCase()}). Keep the meaning. If you think it is already excellent, say why.`,
      sourceText: l.sentence, sourceLabel: "Practice sentence", answerKey: `Model: “${l.model}”\nWhy: ${l.why}`, origin: "library",
    }).returning();
    return row;
  }
  const targets = await targetWordsFor(db, userId, data.targetEntryIds);
  if (data.origin === "library") {
    const lib = LIBRARY.find((l) => l.key === data.key);
    if (!lib) throw notFound("Prompt not found");
    const [row] = await db.insert(writingPrompts).values({
      userId, section: lib.section, taskType: lib.taskType, title: lib.title, instructions: lib.instructions,
      sourceText: lib.sourceText ?? null, sourceLabel: lib.sourceLabel ?? null, answerKey: lib.answerKey ?? null, minWords: lib.minWords ?? null, maxWords: lib.maxWords ?? null,
      timeLimitMinutes: lib.timeLimitMinutes ?? null, origin: "library", targetEntryIds: targets.ids, targetWords: targets.words,
    }).returning();
    return row;
  }
  if (data.origin === "user") {
    const [row] = await db.insert(writingPrompts).values({
      userId, section: data.section, taskType: data.taskType, title: data.title, instructions: data.instructions,
      sourceText: data.sourceText ?? null, sourceLabel: data.sourceText ? (data.section === "sentence" ? "Practice sentence" : "Provided by you") : null,
      answerKey: data.answerKey ?? null, minWords: data.minWords ?? null,
      maxWords: data.maxWords ?? null, timeLimitMinutes: data.timeLimitMinutes ?? null, origin: "user", targetEntryIds: targets.ids, targetWords: targets.words,
    }).returning();
    return row;
  }
  const { data: out, meta } = await runFeature(db, userId, "writingPrompt", {
    section: data.section, taskType: data.taskType, topic: data.topic, difficulty: data.difficulty, targetWords: targets.words, minutes: data.minutes ?? null,
    targetLength: data.targetLength ?? null,
  });
  // The learner's chosen length wins over whatever range the model proposed.
  const range = data.targetLength
    ? { minWords: Math.round(data.targetLength * 0.9), maxWords: Math.round(data.targetLength * 1.1) }
    : { minWords: out.minWords, maxWords: out.maxWords };
  const [row] = await db.insert(writingPrompts).values({
    userId, section: data.section, taskType: data.taskType, title: out.title, instructions: out.instructions, sourceText: out.sourceText,
    sourceLabel: out.sourceText ? (out.sourceLabel ?? "Original text written for this exercise (fictional)") : null,
    ...range, timeLimitMinutes: data.minutes ?? null, difficulty: data.difficulty,
    origin: "ai", isDemo: meta.demo, targetEntryIds: targets.ids, targetWords: targets.words,
  }).returning();
  return row;
}

export async function getPrompt(db: Db, userId: string, id: string) {
  const [p] = await db.select().from(writingPrompts).where(and(eq(writingPrompts.userId, userId), eq(writingPrompts.id, id)));
  if (!p) throw notFound("Prompt not found");
  return p;
}

// ---------------------------------------------------------------- drafts

export async function createDraft(db: Db, userId: string, promptId: string | null, title?: string, body = "") {
  if (promptId) await getPrompt(db, userId, promptId);
  const prompt = promptId ? await getPrompt(db, userId, promptId) : null;
  const [d] = await db.insert(writingDrafts).values({ userId, promptId, title: title?.slice(0, 160) || prompt?.title || "Untitled draft", body }).returning();
  return d;
}

export async function listDrafts(db: Db, userId: string) {
  return db
    .select({
      id: writingDrafts.id, title: writingDrafts.title, updatedAt: writingDrafts.updatedAt, promptId: writingDrafts.promptId,
      words: sql<number>`array_length(regexp_split_to_array(trim(${writingDrafts.body}), '\\s+'), 1)`,
      submissions: sql<number>`(select count(*)::int from ${writingSubmissions} s where s.draft_id = ${writingDrafts.id})`,
      section: writingPrompts.section, taskType: writingPrompts.taskType,
    })
    .from(writingDrafts)
    .leftJoin(writingPrompts, eq(writingPrompts.id, writingDrafts.promptId))
    .where(eq(writingDrafts.userId, userId))
    .orderBy(desc(writingDrafts.updatedAt))
    .limit(100);
}

export async function getDraft(db: Db, userId: string, id: string) {
  const [d] = await db.select().from(writingDrafts).where(and(eq(writingDrafts.userId, userId), eq(writingDrafts.id, id)));
  if (!d) throw notFound("Draft not found");
  const prompt = d.promptId ? (await db.select().from(writingPrompts).where(eq(writingPrompts.id, d.promptId)))[0] ?? null : null;
  const submissions = await db.select({
    id: writingSubmissions.id, versionNo: writingSubmissions.versionNo, wordCount: writingSubmissions.wordCount, createdAt: writingSubmissions.createdAt,
    assessmentStatus: writingAssessments.status, assessmentId: writingAssessments.id,
  }).from(writingSubmissions)
    .leftJoin(writingAssessments, eq(writingAssessments.submissionId, writingSubmissions.id))
    .where(and(eq(writingSubmissions.userId, userId), eq(writingSubmissions.draftId, id)))
    .orderBy(asc(writingSubmissions.versionNo));
  const safePrompt = prompt && !submissions.length ? { ...prompt, answerKey: prompt.answerKey ? "(revealed after you submit)" : null } : prompt;
  return { draft: d, prompt: safePrompt, submissions };
}

export const draftPatchSchema = z.object({
  body: z.string().max(60000).optional(),
  title: z.string().trim().max(160).optional(),
  elapsedSeconds: z.number().int().min(0).max(86400).optional(),
  timerStarted: z.boolean().optional(),
  baseVersion: z.number().int().min(1),
});

/** Autosave with optimistic concurrency: a stale device gets 409 and the server copy. */
export async function saveDraft(db: Db, userId: string, id: string, patch: z.input<typeof draftPatchSchema>) {
  const p = draftPatchSchema.parse(patch);
  const [cur] = await db.select().from(writingDrafts).where(and(eq(writingDrafts.userId, userId), eq(writingDrafts.id, id)));
  if (!cur) throw notFound("Draft not found");
  if (cur.version !== p.baseVersion) throw conflict("This draft was changed on another device", { server: cur });
  const [row] = await db.update(writingDrafts).set({
    ...(p.body !== undefined ? { body: p.body } : {}),
    ...(p.title !== undefined ? { title: p.title || "Untitled draft" } : {}),
    ...(p.elapsedSeconds !== undefined ? { elapsedSeconds: p.elapsedSeconds } : {}),
    ...(p.timerStarted && !cur.timerStartedAt ? { timerStartedAt: new Date() } : {}),
    version: cur.version + 1,
    updatedAt: new Date(),
  }).where(and(eq(writingDrafts.id, id), eq(writingDrafts.version, p.baseVersion))).returning();
  if (!row) throw conflict("This draft was changed on another device", { server: cur });
  return row;
}

export async function deleteDraft(db: Db, userId: string, id: string) {
  const res = await db.delete(writingDrafts).where(and(eq(writingDrafts.userId, userId), eq(writingDrafts.id, id))).returning({ id: writingDrafts.id });
  if (!res.length) throw notFound("Draft not found");
}

/** Freeze the current draft text as a new, immutable submission version. */
export async function submitDraft(db: Db, userId: string, id: string) {
  const { draft } = await getDraft(db, userId, id);
  if (wordCount(draft.body) < 3) throw badRequest("Write something before submitting");
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${writingSubmissions.versionNo}), 0)::int` }).from(writingSubmissions)
    .where(eq(writingSubmissions.draftId, id));
  const [s] = await db.insert(writingSubmissions).values({
    userId, draftId: id, promptId: draft.promptId, body: draft.body, wordCount: wordCount(draft.body), versionNo: n + 1,
    elapsedSeconds: draft.elapsedSeconds,
  }).returning();
  return s;
}

export async function getSubmission(db: Db, userId: string, id: string) {
  const [s] = await db.select().from(writingSubmissions).where(and(eq(writingSubmissions.userId, userId), eq(writingSubmissions.id, id)));
  if (!s) throw notFound("Submission not found");
  const [a] = await db.select().from(writingAssessments).where(eq(writingAssessments.submissionId, id));
  const prompt = s.promptId ? (await db.select().from(writingPrompts).where(eq(writingPrompts.id, s.promptId)))[0] ?? null : null;
  const responses = a ? await db.select().from(feedbackResponses).where(eq(feedbackResponses.assessmentId, a.id)).orderBy(asc(feedbackResponses.createdAt)) : [];
  const versions = await db.select({ id: writingSubmissions.id, versionNo: writingSubmissions.versionNo }).from(writingSubmissions)
    .where(eq(writingSubmissions.draftId, s.draftId)).orderBy(asc(writingSubmissions.versionNo));
  return { submission: s, assessment: a ?? null, prompt, responses, versions };
}

/** Vocabulary from the learner's own list that appears in the text (presence only). */
export async function vocabularyInText(db: Db, userId: string, text: string) {
  const rows = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  return rows.filter((r) => normalizeHeadword(r.headword).length > 3 && inflectionPattern(r.headword)?.test(text)).map((r) => ({ id: r.id, headword: r.headword }));
}

export async function assessSubmission(db: Db, userId: string, submissionId: string, opts: { wantEstimate: boolean }) {
  const { submission, prompt, assessment: existing } = await getSubmission(db, userId, submissionId);
  if (existing?.status === "complete") return existing;
  if (existing?.status === "pending" && Date.now() - existing.createdAt.getTime() < 3 * 60000) {
    throw conflict("An assessment is already running for this version");
  }
  const patterns = await db.select({ category: writingErrorPatterns.category }).from(writingErrorPatterns)
    .where(and(eq(writingErrorPatterns.userId, userId), sql`${writingErrorPatterns.submissionsAffected} >= 2`));
  let a = existing;
  if (!a) {
    [a] = await db.insert(writingAssessments).values({ userId, submissionId, status: "pending" }).returning();
  } else {
    [a] = await db.update(writingAssessments).set({ status: "pending", error: null, createdAt: new Date() }).where(eq(writingAssessments.id, a.id)).returning();
  }
  try {
    const { data, meta } = await runFeature(db, userId, "assess", {
      section: prompt?.section ?? "essay",
      taskType: prompt?.taskType ?? "free",
      title: prompt?.title ?? "Free writing",
      instructions: prompt?.instructions ?? "Free writing",
      sourceText: prompt?.sourceText ?? null,
      body: submission.body,
      targetWords: prompt?.targetWords ?? [],
      minWords: prompt?.minWords ?? null,
      maxWords: prompt?.maxWords ?? null,
      wantEstimate: opts.wantEstimate && !!prompt && prompt.section === "abitur",
      previousPatterns: patterns.map((p) => p.category),
      rubricNote: rubricNote(prompt?.taskType ?? "free"),
    });
    const [done] = await db.update(writingAssessments).set({
      status: "complete", provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, isDemo: meta.demo,
      result: data as unknown as Record<string, unknown>, completedAt: new Date(),
    }).where(eq(writingAssessments.id, a.id)).returning();
    if (!meta.demo) await applyAssessmentSideEffects(db, userId, data, prompt?.targetEntryIds ?? [], prompt?.targetWords ?? [], submission.body);
    return done;
  } catch (e) {
    const message = e instanceof AIError ? e.message : "The assessment failed. Your text is saved; try again.";
    await db.update(writingAssessments).set({ status: "failed", error: message }).where(eq(writingAssessments.id, a.id));
    throw e;
  }
}

export type AssessData = Awaited<ReturnType<typeof runFeature<"assess">>>["data"];

export type OwnWordStatus = "correct" | "unnatural" | "incorrect" | "used";
/** Writing/production evidence per judgement; "used" (present, not commented on) is a modest credit. */
const WRITING_SCORE: Record<OwnWordStatus, number> = { correct: 1, unnatural: 0.5, incorrect: 0.1, used: 0.6 };
const WORD_CATEGORIES = new Set(["vocabulary", "collocation", "register", "spelling"]);

/**
 * How the assessment judged each of the learner's own words found in the text:
 * an explicit target-word verdict first, then a short word-level comment quoting
 * the word (error → incorrect, suggestion → unnatural), otherwise just "used".
 * Long excerpts are ignored: a comment on a whole sentence is not about one word.
 */
export function judgeOwnVocabulary(data: AssessData, words: { id: string; headword: string }[]): Map<string, OwnWordStatus> {
  const out = new Map<string, OwnWordStatus>();
  const short = (excerpt: string) => wordCount(excerpt) <= 8;
  for (const w of words) {
    const re = inflectionPattern(w.headword);
    const verdict = data.vocabulary.targetUse.find((t) => normalizeHeadword(t.word) === normalizeHeadword(w.headword));
    if (verdict && (verdict.status === "correct" || verdict.status === "unnatural" || verdict.status === "incorrect")) {
      out.set(w.id, verdict.status);
      continue;
    }
    const comments = data.annotations.filter((a) => WORD_CATEGORIES.has(a.category) && short(a.excerpt) && !!re?.test(a.excerpt));
    if (comments.some((a) => a.isError)) out.set(w.id, "incorrect");
    else if (comments.length || data.vocabulary.simplerBetter.some((x) => short(x.excerpt) && !!re?.test(x.excerpt))) out.set(w.id, "unnatural");
    else out.set(w.id, "used");
  }
  return out;
}

/** The learner's own vocabulary in a submission, with the assessment's judgement when there is a real one. */
export async function ownVocabularyJudged(db: Db, userId: string, body: string, result: AssessData | null) {
  const words = await vocabularyInText(db, userId, body);
  const judged = result ? judgeOwnVocabulary(result, words) : null;
  return words.map((w) => ({ ...w, status: judged?.get(w.id) ?? null }));
}

async function applyAssessmentSideEffects(db: Db, userId: string, data: AssessData, targetIds: string[], targetWords: string[], body: string) {
  const now = new Date();
  // Vocabulary-to-writing: credit correct use, record weak use. "not_needed" is neutral.
  const score = { correct: 1, unnatural: 0.5, incorrect: 0.1 } as Record<string, number>;
  for (const t of data.vocabulary.targetUse) {
    const idx = targetWords.findIndex((w) => normalizeHeadword(w) === normalizeHeadword(t.word));
    if (idx >= 0 && targetIds[idx] && score[t.status] !== undefined) await recordWritingUse(db, userId, targetIds[idx], score[t.status], now);
  }
  // The learner's other own words in the text get evidence too (target words were credited above).
  const own = (await vocabularyInText(db, userId, body)).filter((w) => !targetIds.includes(w.id));
  for (const [entryId, status] of judgeOwnVocabulary(data, own)) await recordWritingUse(db, userId, entryId, WRITING_SCORE[status], now);
  // Error patterns with spaced revisiting.
  const counts = new Map<string, number>();
  for (const p of data.errorPatterns) counts.set(normalizeCategory(p.category), (counts.get(normalizeCategory(p.category)) ?? 0) + p.count);
  for (const a of data.annotations.filter((x) => x.isError)) {
    const c = normalizeCategory(a.category);
    if (!counts.has(c)) counts.set(c, 1);
  }
  const existing = await db.select().from(writingErrorPatterns).where(eq(writingErrorPatterns.userId, userId));
  const examples = new Map<string, string[]>();
  for (const a of data.annotations.filter((x) => x.isError)) {
    const c = normalizeCategory(a.category);
    examples.set(c, [...(examples.get(c) ?? []), a.excerpt].slice(0, 3));
  }
  for (const [category, n] of counts) {
    const prev = existing.find((e) => e.category === category);
    const next = nextRevisit(prev ?? { intervalDays: 1 }, true, now);
    if (prev) {
      await db.update(writingErrorPatterns).set({
        occurrences: prev.occurrences + n, submissionsAffected: prev.submissionsAffected + 1, lastSeen: now, ...next,
        examples: [...(examples.get(category) ?? []), ...prev.examples].slice(0, 6), updatedAt: now,
      }).where(and(eq(writingErrorPatterns.userId, userId), eq(writingErrorPatterns.category, category)));
    } else {
      await db.insert(writingErrorPatterns).values({
        userId, category, occurrences: n, submissionsAffected: 1, lastSeen: now, ...next, examples: examples.get(category) ?? [],
      });
    }
  }
  for (const prev of existing.filter((e) => !counts.has(e.category))) {
    const next = nextRevisit(prev, false, now);
    await db.update(writingErrorPatterns).set({ cleanSubmissions: prev.cleanSubmissions + 1, ...next, updatedAt: now })
      .where(and(eq(writingErrorPatterns.userId, userId), eq(writingErrorPatterns.category, prev.category)));
  }
}

export const feedbackSchema = z.object({
  annotationId: z.string().max(40),
  action: z.enum(["understood", "challenge", "clarify", "accepted", "rejected"]),
  message: z.string().trim().max(2000).optional(),
  /** With "accepted": replace the quoted excerpt in the latest draft (draftVersion as in the draft PATCH). */
  apply: z.object({ replacement: z.string().trim().min(1).max(2000), draftVersion: z.number().int().min(1) }).optional(),
});

export type AppliedSuggestion =
  | { status: "applied"; draft: typeof writingDrafts.$inferSelect; message: string }
  | { status: "not_found" | "ambiguous"; message: string };

/**
 * Apply an accepted suggestion to the submission's draft: the excerpt is replaced
 * only if it occurs exactly once (otherwise nothing changes and the learner is told
 * why). Optimistic concurrency as in saveDraft: a stale draftVersion gets 409.
 */
export async function applySuggestionToDraft(db: Db, userId: string, submissionId: string, excerpt: string, input: { replacement: string; draftVersion: number }): Promise<AppliedSuggestion> {
  const [sub] = await db.select({ draftId: writingSubmissions.draftId }).from(writingSubmissions)
    .where(and(eq(writingSubmissions.userId, userId), eq(writingSubmissions.id, submissionId)));
  if (!sub) throw notFound("Submission not found");
  const [cur] = await db.select().from(writingDrafts).where(and(eq(writingDrafts.userId, userId), eq(writingDrafts.id, sub.draftId)));
  if (!cur) throw notFound("Draft not found");
  if (cur.version !== input.draftVersion) throw conflict("The draft was changed since you opened this report. Reload and try again.", { server: cur });
  const needle = excerpt.trim();
  const occurrences = needle ? cur.body.split(needle).length - 1 : 0;
  if (occurrences === 0) {
    return { status: "not_found", message: "The quoted passage is no longer in your draft (perhaps you have already revised it), so the draft was not changed." };
  }
  if (occurrences > 1) {
    return { status: "ambiguous", message: `The quoted passage occurs ${occurrences} times in your draft, so it was not changed automatically. Edit the right place in the draft yourself.` };
  }
  const i = cur.body.indexOf(needle);
  const [row] = await db.update(writingDrafts).set({
    body: cur.body.slice(0, i) + input.replacement + cur.body.slice(i + needle.length), version: cur.version + 1, updatedAt: new Date(),
  }).where(and(eq(writingDrafts.id, cur.id), eq(writingDrafts.version, cur.version))).returning();
  if (!row) throw conflict("This draft was changed on another device", { server: cur });
  return { status: "applied", draft: row, message: "Applied to your draft. Submit a new version when you have finished revising." };
}

export async function respondToFeedback(db: Db, userId: string, assessmentId: string, input: z.input<typeof feedbackSchema>) {
  const data = feedbackSchema.parse(input);
  const [a] = await db.select().from(writingAssessments).where(and(eq(writingAssessments.userId, userId), eq(writingAssessments.id, assessmentId)));
  if (!a || !a.result) throw notFound("Assessment not found");
  const ann = (a.result.annotations as { id: string; excerpt: string; explanation: string; suggestion: string; category: string }[]).find((x) => x.id === data.annotationId);
  if (!ann) throw notFound("Comment not found");
  // Applied first: a version conflict records nothing, so the learner can reload and retry.
  const applied = data.action === "accepted" && data.apply ? await applySuggestionToDraft(db, userId, a.submissionId, ann.excerpt, data.apply) : null;
  let reply: Record<string, unknown> | null = null;
  if (data.action === "challenge" || data.action === "clarify") {
    if (data.action === "challenge" && !data.message) throw badRequest("Explain why you disagree");
    const [sub] = await db.select().from(writingSubmissions).where(eq(writingSubmissions.id, a.submissionId));
    const { data: out, meta } = await runFeature(db, userId, "challenge", {
      text: sub.body, annotation: ann, argument: data.message ?? "Please explain this more simply.", mode: data.action,
    });
    reply = { ...out, demo: meta.demo, promptVersion: meta.promptVersion };
  }
  const [row] = await db.insert(feedbackResponses).values({
    userId, assessmentId, annotationId: data.annotationId, action: data.action, message: data.message ?? null, reply,
  }).returning();
  return { response: row, applied };
}

export async function errorPatterns(db: Db, userId: string) {
  return db.select().from(writingErrorPatterns).where(eq(writingErrorPatterns.userId, userId)).orderBy(desc(writingErrorPatterns.submissionsAffected));
}

export async function recentSubmissions(db: Db, userId: string, limit = 20) {
  return db.select({
    id: writingSubmissions.id, draftId: writingSubmissions.draftId, versionNo: writingSubmissions.versionNo, wordCount: writingSubmissions.wordCount,
    createdAt: writingSubmissions.createdAt, title: writingDrafts.title, status: writingAssessments.status, isDemo: writingAssessments.isDemo,
    result: writingAssessments.result,
  }).from(writingSubmissions)
    .innerJoin(writingDrafts, eq(writingDrafts.id, writingSubmissions.draftId))
    .leftJoin(writingAssessments, eq(writingAssessments.submissionId, writingSubmissions.id))
    .where(eq(writingSubmissions.userId, userId))
    .orderBy(desc(writingSubmissions.createdAt))
    .limit(limit);
}
