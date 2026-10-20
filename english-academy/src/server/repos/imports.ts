import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { importJobs, learningStates, topicMemberships, topics, vocabEntries, vocabExamples, type ImportCandidate } from "@/db/schema";
import { suggestTopic } from "@/domain/vocab/organize";
import { parseVocabularyText, type ParsedCandidate } from "@/domain/vocab/parse";
import { normalizeHeadword } from "@/lib/text";
import { badRequest, notFound } from "../http";
import { findDuplicates, getOrCreateTopic } from "./vocab";

export const MAX_IMPORT_ITEMS = 1500;

export async function createImportJob(
  db: Db,
  userId: string,
  input: { text: string; sourceKind: "paste" | "file" | "image"; filename?: string; extraNotes?: string[]; uncertainAll?: string },
) {
  const parsed = parseVocabularyText(input.text);
  if (parsed.candidates.length > MAX_IMPORT_ITEMS) {
    throw badRequest(`This list has ${parsed.candidates.length} entries; the limit per import is ${MAX_IMPORT_ITEMS}. Split it into parts.`);
  }
  return saveCandidates(db, userId, parsed.candidates, {
    sourceKind: input.sourceKind,
    filename: input.filename,
    format: parsed.format,
    notes: [...(input.extraNotes ?? []), ...parsed.notes],
    uncertainAll: input.uncertainAll,
  });
}

export async function saveCandidates(
  db: Db,
  userId: string,
  parsed: ParsedCandidate[],
  meta: { sourceKind: string; filename?: string; format: string; notes: string[]; uncertainAll?: string },
) {
  const dupes = await findDuplicates(db, userId, parsed.map((c) => c.headword).filter(Boolean));
  const seen = new Map<string, string>();
  const candidates: ImportCandidate[] = parsed.map((c, i) => {
    const key = `c${i}`;
    const uncertain = [...c.uncertain];
    if (meta.uncertainAll) uncertain.push(meta.uncertainAll);
    const norm = normalizeHeadword(c.headword);
    const dupInList = norm && seen.get(norm);
    if (dupInList) uncertain.push(`Appears twice in this list (also ${dupInList})`);
    if (norm) seen.set(norm, key);
    const s = c.heading ? null : suggestTopic([c.headword, c.definitionEn, c.translationDe, c.example].filter(Boolean).join(" "));
    return {
      key,
      headword: c.headword,
      translationDe: c.translationDe,
      definitionEn: c.definitionEn,
      example: c.example,
      synonyms: c.synonyms,
      antonyms: c.antonyms,
      partOfSpeech: c.partOfSpeech,
      heading: c.heading,
      suggestedTopic: c.heading ?? (s ? `${s.topic} › ${s.subtopic}` : undefined),
      uncertain,
      duplicateOf: dupes.get(c.headword),
      include: !!c.headword && !dupInList,
      raw: c.raw.slice(0, 500),
    };
  });
  const [job] = await db.insert(importJobs).values({
    userId, sourceKind: meta.sourceKind, filename: meta.filename ?? null, detectedFormat: meta.format, notes: meta.notes, candidates,
  }).returning();
  return job;
}

export async function getImportJob(db: Db, userId: string, id: string) {
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.userId, userId), eq(importJobs.id, id)));
  if (!job) throw notFound("Import not found");
  return job;
}

export async function recentImports(db: Db, userId: string) {
  return db.select({ id: importJobs.id, status: importJobs.status, filename: importJobs.filename, sourceKind: importJobs.sourceKind, createdAt: importJobs.createdAt, result: importJobs.result })
    .from(importJobs).where(eq(importJobs.userId, userId)).orderBy(desc(importJobs.createdAt)).limit(10);
}

const candidateEditSchema = z.object({
  key: z.string(),
  headword: z.string().trim().max(120),
  translationDe: z.string().trim().max(300).optional(),
  definitionEn: z.string().trim().max(500).optional(),
  example: z.string().trim().max(500).optional(),
  partOfSpeech: z.string().trim().max(40).optional(),
  synonyms: z.array(z.string().trim().max(80)).max(30).optional(),
  antonyms: z.array(z.string().trim().max(80)).max(30).optional(),
  include: z.boolean(),
  /** For duplicates: skip, merge new info into the existing word, or create anyway. */
  duplicateAction: z.enum(["skip", "merge", "create"]).optional(),
  /** "Topic › Subtopic" path, or "" for none. */
  topicPath: z.string().trim().max(170).optional(),
});

export const commitSchema = z.object({
  candidates: z.array(candidateEditSchema).max(MAX_IMPORT_ITEMS),
  defaultTopicId: z.string().uuid().nullish(),
  defaultTopicName: z.string().trim().max(80).nullish(),
});

async function topicForPath(db: Db, userId: string, path: string, cache: Map<string, string>) {
  if (cache.has(path)) return cache.get(path)!;
  const [parentName, childName] = path.split("›").map((s) => s.trim()).filter(Boolean);
  const parent = await getOrCreateTopic(db, userId, parentName);
  const id = childName ? (await getOrCreateTopic(db, userId, childName, parent.id)).id : parent.id;
  cache.set(path, id);
  return id;
}

const mergeList = (a: string[], b?: string[]) => [...new Set([...a, ...(b ?? [])].map((s) => s.trim()).filter(Boolean))];

export async function commitImport(db: Db, userId: string, jobId: string, input: z.input<typeof commitSchema>) {
  const data = commitSchema.parse(input);
  const job = await getImportJob(db, userId, jobId);
  if (job.status !== "review") throw badRequest("This import was already completed or cancelled");
  const known = new Set(job.candidates.map((c) => c.key));
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const topicCache = new Map<string, string>();
    let defaultTopicId = data.defaultTopicId ?? null;
    if (defaultTopicId) {
      await topicForPathOwned(tx, userId, defaultTopicId);
    } else if (data.defaultTopicName) {
      defaultTopicId = (await getOrCreateTopic(tx, userId, data.defaultTopicName)).id;
    }
    let created = 0;
    let merged = 0;
    let skipped = 0;
    const topicIds = new Set<string>();
    const createdIds: string[] = [];
    for (const c of data.candidates) {
      if (!known.has(c.key)) throw badRequest("Unknown entry in import");
      if (!c.include || !c.headword) {
        skipped++;
        continue;
      }
      const topicId = c.topicPath ? await topicForPath(tx, userId, c.topicPath, topicCache) : defaultTopicId;
      if (topicId) topicIds.add(topicId);
      const norm = normalizeHeadword(c.headword);
      const [existing] = await tx.select().from(vocabEntries)
        .where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.normalized, norm)));
      const action = existing ? (c.duplicateAction ?? "skip") : "create";
      if (existing && action === "skip") {
        skipped++;
        if (topicId) await tx.insert(topicMemberships).values({ userId, entryId: existing.id, topicId }).onConflictDoNothing();
        continue;
      }
      if (existing && action === "merge") {
        await tx.update(vocabEntries).set({
          translationDe: existing.translationDe ?? c.translationDe ?? null,
          definitionEn: existing.definitionEn ?? c.definitionEn ?? null,
          partOfSpeech: existing.partOfSpeech ?? c.partOfSpeech ?? null,
          synonyms: mergeList(existing.synonyms, c.synonyms),
          antonyms: mergeList(existing.antonyms, c.antonyms),
          notes: existing.translationDe && c.translationDe && existing.translationDe !== c.translationDe
            ? [existing.notes, `Also imported as: ${c.translationDe}`].filter(Boolean).join("\n")
            : existing.notes,
          version: existing.version + 1,
          updatedAt: new Date(),
        }).where(eq(vocabEntries.id, existing.id));
        if (c.example) await tx.insert(vocabExamples).values({ userId, entryId: existing.id, text: c.example, kind: "source", origin: "import", topicId });
        if (topicId) await tx.insert(topicMemberships).values({ userId, entryId: existing.id, topicId }).onConflictDoNothing();
        merged++;
        continue;
      }
      const pos = c.partOfSpeech || null;
      const sameKey = existing && (existing.partOfSpeech ?? "") === (pos ?? "");
      if (sameKey) {
        // Unique (headword, part of speech): "create anyway" needs a distinguishing part of speech.
        skipped++;
        continue;
      }
      const [row] = await tx.insert(vocabEntries).values({
        userId, headword: c.headword, normalized: norm, partOfSpeech: pos, translationDe: c.translationDe || null,
        definitionEn: c.definitionEn || null, synonyms: c.synonyms ?? [], antonyms: c.antonyms ?? [],
        source: job.filename ? `Import: ${job.filename}` : "Import",
      }).returning();
      if (c.example) await tx.insert(vocabExamples).values({ userId, entryId: row.id, text: c.example, kind: "source", origin: "import", topicId });
      if (topicId) await tx.insert(topicMemberships).values({ userId, entryId: row.id, topicId }).onConflictDoNothing();
      await tx.insert(learningStates).values({ userId, entryId: row.id, due: new Date() }).onConflictDoNothing();
      createdIds.push(row.id);
      created++;
    }
    const result = { created, merged, skipped, topicIds: [...topicIds] };
    await tx.update(importJobs).set({ status: "imported", result }).where(eq(importJobs.id, jobId));
    return { ...result, createdIds };
  });
}

async function topicForPathOwned(db: Db, userId: string, topicId: string) {
  const [t] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.userId, userId), eq(topics.id, topicId)));
  if (!t) throw notFound("Topic not found");
}

export async function cancelImport(db: Db, userId: string, jobId: string) {
  const job = await getImportJob(db, userId, jobId);
  if (job.status !== "review") return job;
  const [row] = await db.update(importJobs).set({ status: "cancelled", candidates: [] }).where(eq(importJobs.id, jobId)).returning();
  return row;
}
