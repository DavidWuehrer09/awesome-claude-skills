import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "@/db/client";
import { topicMemberships, topics, vocabEntries, vocabExamples, type EnrichmentMeta } from "@/db/schema";
import { AIError } from "../ai/errors";
import type { enrichOutput } from "../ai/features";
import { runFeature } from "../ai/service";

export const MAX_ENRICH_BATCH = 20;

/** AI errors that make every further request in this batch pointless. */
const STOP_CODES = new Set(["quota", "budget", "disabled", "rate_limited", "auth", "unavailable"]);

type Suggestions = z.infer<typeof enrichOutput>;
type EntryRow = typeof vocabEntries.$inferSelect;

const TEXT_FIELDS = ["partOfSpeech", "translationDe", "definitionEn", "cefr", "register", "connotation", "grammarNotes", "ipa"] as const;
const LIST_FIELDS = ["collocations", "synonyms", "antonyms", "wordFamily", "patterns", "commonMistakes", "confusables", "idioms"] as const;

/** Fill only the fields the learner left empty; their own data is never overwritten. */
export function gapFill(entry: EntryRow, s: Suggestions) {
  const patch: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) {
    const v = s[k];
    if (!entry[k] && typeof v === "string" && v.trim()) patch[k] = v.trim();
  }
  for (const k of LIST_FIELDS) {
    const v = s[k] as unknown[];
    if (!(entry[k] as unknown[]).length && v.length) patch[k] = v;
  }
  return patch;
}

export type BatchResult = {
  enriched: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
  /** Ids not attempted because the batch stopped (quota, budget, AI off). */
  remaining: string[];
  stopped: { code: string; message: string } | null;
  demo: boolean;
};

/**
 * Enrich words one after another (max 20 per call). Stops cleanly at the first
 * quota/budget/availability error and reports what is left. Demo output is
 * never saved: it contains no real dictionary information.
 */
export async function enrichBatch(db: Db, userId: string, ids: string[]): Promise<BatchResult> {
  const wanted = [...new Set(ids)].slice(0, MAX_ENRICH_BATCH);
  const rows = wanted.length ? await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, wanted))) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const queue = wanted.filter((id) => byId.has(id));
  const out: BatchResult = { enriched: [], unchanged: [], failed: [], remaining: [], stopped: null, demo: false };
  for (let i = 0; i < queue.length; i++) {
    const entry = byId.get(queue[i])!;
    const [example] = await db.select({ text: vocabExamples.text }).from(vocabExamples)
      .where(and(eq(vocabExamples.userId, userId), eq(vocabExamples.entryId, entry.id))).limit(1);
    const [topic] = await db.select({ name: topics.name }).from(topicMemberships).innerJoin(topics, eq(topics.id, topicMemberships.topicId))
      .where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.entryId, entry.id))).limit(1);
    try {
      const { data, meta } = await runFeature(db, userId, "enrich", {
        headword: entry.headword, partOfSpeech: entry.partOfSpeech, translationDe: entry.translationDe, definitionEn: entry.definitionEn,
        context: example?.text ?? null, topic: topic?.name ?? null,
      });
      if (meta.demo) {
        out.demo = true;
        out.unchanged.push(entry.id);
        continue;
      }
      const patch = gapFill(entry, data);
      const newExamples = example ? [] : data.examples.filter((ex) => ex.text.trim()).slice(0, 4);
      const fields = [...Object.keys(patch), ...(newExamples.length ? ["examples"] : [])];
      if (!fields.length) {
        out.unchanged.push(entry.id);
        continue;
      }
      const enrichment: EnrichmentMeta = { provider: meta.provider, model: meta.model, promptVersion: meta.promptVersion, at: new Date().toISOString(), demo: false, fields };
      const saved = await db.transaction(async (tx) => {
        const updated = await tx.update(vocabEntries).set({ ...patch, enrichment, version: entry.version + 1, updatedAt: new Date() } as Partial<typeof vocabEntries.$inferInsert>)
          .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.id, entry.id), eq(vocabEntries.version, entry.version)))
          .returning({ id: vocabEntries.id });
        // Edited by the learner in the meantime: leave their version alone.
        if (!updated.length) return false;
        if (newExamples.length) {
          await tx.insert(vocabExamples).values(newExamples.map((ex) => ({ userId, entryId: entry.id, text: ex.text.trim(), kind: ex.kind, origin: "ai" })));
        }
        return true;
      });
      (saved ? out.enriched : out.unchanged).push(entry.id);
    } catch (e) {
      if (e instanceof AIError && STOP_CODES.has(e.code)) {
        out.stopped = { code: e.code, message: e.message };
        out.remaining = queue.slice(i);
        break;
      }
      out.failed.push({ id: entry.id, error: e instanceof Error ? e.message : "Enrichment failed" });
    }
  }
  return out;
}
