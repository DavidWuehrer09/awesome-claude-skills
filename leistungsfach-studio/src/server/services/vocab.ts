import "server-only";
import { and, asc, desc, eq, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";
import { runAI } from "@/lib/ai/client";
import { VocabUseOutputSchema, type AssessmentOutput } from "@/lib/ai/schemas";
import { buildVocabPrompt, validateVocab } from "@/lib/ai/prompts/misc";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/types";
import { scheduleNext, type ReviewOutcome } from "@/lib/learner/spaced";
import { normalizeForMatch } from "@/lib/text/normalize";
import { getDb, schema } from "@/server/db/client";
import { AppError, notFound } from "@/server/http";

export const REGISTERS = ["formal", "neutral", "informal", "academic"] as const;

export const VocabInput = z.object({
  term: z.string().trim().min(1).max(200),
  meaning: z.string().max(1000).default(""),
  collocations: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  register: z.enum(REGISTERS).default("neutral"),
  example: z.string().max(1000).default(""),
  pitfalls: z.string().max(1000).default(""),
  topic: z.string().max(200).default(""),
  sourceType: z.enum(["manual", "assessment", "revision", "exercise"]).default("manual"),
  sourceId: z.string().nullable().default(null),
});

export async function listVocab(opts: { q?: string; status?: string; due?: boolean } = {}) {
  const db = await getDb();
  const conds = [];
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(schema.vocabEntries.term, like), ilike(schema.vocabEntries.meaning, like), ilike(schema.vocabEntries.topic, like)));
  }
  if (opts.status) conds.push(eq(schema.vocabEntries.status, opts.status));
  if (opts.due) conds.push(lte(schema.vocabEntries.nextReviewAt, new Date()));
  const q = db.select().from(schema.vocabEntries).where(conds.length ? and(...conds) : undefined);
  return opts.due ? q.orderBy(asc(schema.vocabEntries.nextReviewAt)) : q.orderBy(desc(schema.vocabEntries.createdAt));
}

export async function createVocab(input: z.infer<typeof VocabInput>) {
  const db = await getDb();
  const existing = (await db.select().from(schema.vocabEntries)).find((v) => normalizeForMatch(v.term) === normalizeForMatch(input.term));
  if (existing) throw new AppError("duplicate", `"${existing.term}" is already in your vocabulary bank.`, 409, { id: existing.id });
  const [row] = await db.insert(schema.vocabEntries).values({ ...input, nextReviewAt: new Date() }).returning();
  return row;
}

export async function updateVocab(id: string, input: Partial<z.infer<typeof VocabInput>>) {
  const db = await getDb();
  const [row] = await db.update(schema.vocabEntries).set(input).where(eq(schema.vocabEntries.id, id)).returning();
  if (!row) throw notFound("Vocabulary entry");
  return row;
}

export async function deleteVocab(id: string) {
  const db = await getDb();
  await db.delete(schema.vocabEntries).where(eq(schema.vocabEntries.id, id));
}

/** Adds one of an assessment's vocabulary suggestions to the bank (explicit student action). */
export async function addFromAssessment(assessmentId: string, index: number) {
  const db = await getDb();
  const [a] = await db.select().from(schema.assessments).where(eq(schema.assessments.id, assessmentId));
  const s = (a?.result as AssessmentOutput | undefined)?.vocabulary_suggestions?.[index];
  if (!s) throw notFound("Vocabulary suggestion");
  return createVocab({ term: s.term, meaning: s.meaning, example: s.example, pitfalls: "", collocations: [], register: "neutral", topic: "", sourceType: "assessment", sourceId: assessmentId });
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function judgeRecall(term: string, response: string): ReviewOutcome {
  const t = normalizeForMatch(term), r = normalizeForMatch(response);
  if (!r) return "incorrect";
  if (t === r) return "correct";
  if (levenshtein(t, r) <= Math.max(1, Math.floor(t.length / 8))) return "partial";
  return "incorrect";
}

async function applyReview(entry: typeof schema.vocabEntries.$inferSelect, kind: "recall" | "use_in_sentence", response: string, outcome: ReviewOutcome, feedback: unknown) {
  const db = await getDb();
  const s = scheduleNext(entry.reviewIntervalDays, outcome);
  const correctUses = entry.correctUses + (kind === "use_in_sentence" && outcome === "correct" ? 1 : 0);
  let status = entry.status;
  if (kind === "recall" && outcome === "correct" && status === "new") status = "recognised";
  if (kind === "use_in_sentence" && outcome === "correct") status = correctUses >= 3 && s.intervalDays >= 7 ? "secure" : "used_correctly";
  await db.insert(schema.vocabReviews).values({ vocabId: entry.id, kind, response, outcome, feedback: feedback ?? null });
  const [row] = await db.update(schema.vocabEntries).set({ status, correctUses, attempts: entry.attempts + 1, reviewIntervalDays: s.intervalDays, nextReviewAt: s.nextReviewAt })
    .where(eq(schema.vocabEntries.id, entry.id)).returning();
  return row;
}

export async function reviewRecall(id: string, response: string) {
  const db = await getDb();
  const [entry] = await db.select().from(schema.vocabEntries).where(eq(schema.vocabEntries.id, id));
  if (!entry) throw notFound("Vocabulary entry");
  const outcome = judgeRecall(entry.term, response);
  const row = await applyReview(entry, "recall", response, outcome, null);
  return { entry: row, outcome, expected: entry.term };
}

export async function reviewUse(id: string, sentence: string) {
  const db = await getDb();
  const [entry] = await db.select().from(schema.vocabEntries).where(eq(schema.vocabEntries.id, id));
  if (!entry) throw notFound("Vocabulary entry");
  const { system, user } = buildVocabPrompt({ term: entry.term, meaning: entry.meaning, collocations: entry.collocations as string[], register: entry.register, sentence });
  try {
    const { data } = await runAI({ operation: "vocab_check", system, user, schema: VocabUseOutputSchema, effort: "low", maxTokens: 2000, relatedId: id, validate: validateVocab, mockContext: { term: entry.term, sentence } });
    const row = await applyReview(entry, "use_in_sentence", sentence, data.outcome, data);
    return { entry: row, outcome: data.outcome, feedback: data };
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", String(err));
    throw new AppError(`ai_${e.code}`, AI_ERROR_MESSAGES[e.code], e.code === "not_configured" ? 503 : 502);
  }
}

export async function vocabReviews(id: string) {
  const db = await getDb();
  return db.select().from(schema.vocabReviews).where(eq(schema.vocabReviews.vocabId, id)).orderBy(desc(schema.vocabReviews.createdAt)).limit(20);
}
