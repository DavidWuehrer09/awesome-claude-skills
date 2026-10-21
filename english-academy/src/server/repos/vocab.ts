import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  entryTags,
  learningStates,
  reviewEvents,
  tags,
  topicMemberships,
  topics,
  vocabEntries,
  vocabExamples,
  vocabLinks,
  writingDrafts,
} from "@/db/schema";
import { levenshtein, normalizeHeadword } from "@/lib/text";
import { conflict, notFound, badRequest } from "../http";

const str = (max: number) => z.string().trim().max(max);
const list = (max: number) => z.array(z.string().trim().min(1).max(200)).max(max);

export const entryInputSchema = z.object({
  headword: str(120).min(1),
  partOfSpeech: str(40).nullish(),
  translationDe: str(300).nullish(),
  definitionEn: str(500).nullish(),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).nullish(),
  register: str(60).nullish(),
  connotation: str(200).nullish(),
  collocations: list(30).optional(),
  synonyms: list(30).optional(),
  antonyms: list(30).optional(),
  wordFamily: z.array(z.object({ form: str(80).min(1), pos: str(30).optional() })).max(20).optional(),
  patterns: list(20).optional(),
  grammarNotes: str(500).nullish(),
  pronunciation: str(120).nullish(),
  ipa: str(120).nullish(),
  commonMistakes: list(20).optional(),
  confusables: z.array(z.object({ word: str(80).min(1), distinction: str(400) })).max(10).optional(),
  idioms: list(20).optional(),
  acceptedAnswers: list(20).optional(),
  source: str(300).nullish(),
  mnemonic: str(500).nullish(),
  notes: str(4000).nullish(),
  favorite: z.boolean().optional(),
  examples: z.array(z.object({ text: str(500).min(1), kind: z.enum(["natural", "academic", "context", "user", "source"]).default("natural") })).max(20).optional(),
  topicIds: z.array(z.string().uuid()).max(30).optional(),
  tags: list(20).optional(),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export type EntryRow = typeof vocabEntries.$inferSelect;

async function assertTopicsOwned(db: Db, userId: string, topicIds: string[]) {
  if (!topicIds.length) return;
  const own = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)));
  if (own.length !== new Set(topicIds).size) throw notFound("Topic not found");
}

async function setTags(db: Db, userId: string, entryId: string, names: string[]) {
  await db.delete(entryTags).where(and(eq(entryTags.userId, userId), eq(entryTags.entryId, entryId)));
  const clean = [...new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))];
  for (const name of clean) {
    await db.insert(tags).values({ userId, name }).onConflictDoNothing();
    const [t] = await db.select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
    await db.insert(entryTags).values({ userId, entryId, tagId: t.id }).onConflictDoNothing();
  }
}

export async function findByNormalized(db: Db, userId: string, headword: string, pos?: string | null) {
  const norm = normalizeHeadword(headword);
  const rows = await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.normalized, norm)));
  return rows.find((r) => (r.partOfSpeech ?? "") === (pos ?? "")) ?? rows[0] ?? null;
}

export async function createEntry(db: Db, userId: string, input: EntryInput, opts: { isSample?: boolean; origin?: string } = {}) {
  const data = entryInputSchema.parse(input);
  await assertTopicsOwned(db, userId, data.topicIds ?? []);
  const dupe = await findByNormalized(db, userId, data.headword, data.partOfSpeech);
  if (dupe && (dupe.partOfSpeech ?? "") === (data.partOfSpeech ?? "")) {
    throw conflict(`“${dupe.headword}” is already in your vocabulary`, { entryId: dupe.id });
  }
  return db.transaction(async (tx) => {
    const { examples, topicIds, tags: tagNames, ...fields } = data;
    const [row] = await tx
      .insert(vocabEntries)
      .values({
        ...fields,
        userId,
        headword: data.headword,
        normalized: normalizeHeadword(data.headword),
        isSample: opts.isSample ?? false,
      } as typeof vocabEntries.$inferInsert)
      .returning();
    if (examples?.length) {
      await tx.insert(vocabExamples).values(
        examples.map((ex) => ({ userId, entryId: row.id, text: ex.text, kind: ex.kind, origin: opts.origin ?? "user" })),
      );
    }
    if (topicIds?.length) {
      await tx.insert(topicMemberships).values(topicIds.map((topicId) => ({ userId, entryId: row.id, topicId }))).onConflictDoNothing();
    }
    if (tagNames?.length) await setTags(tx as unknown as Db, userId, row.id, tagNames);
    await tx.insert(learningStates).values({ userId, entryId: row.id, due: new Date() }).onConflictDoNothing();
    return row;
  });
}

export async function getEntry(db: Db, userId: string, id: string) {
  const [entry] = await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.id, id)));
  if (!entry) throw notFound("Word not found");
  const [examples, memberships, tagRows, state, links, events] = await Promise.all([
    db.select().from(vocabExamples).where(and(eq(vocabExamples.userId, userId), eq(vocabExamples.entryId, id))).orderBy(asc(vocabExamples.createdAt)),
    db.select({ id: topics.id, name: topics.name, parentId: topics.parentId, kind: topics.kind }).from(topicMemberships)
      .innerJoin(topics, eq(topics.id, topicMemberships.topicId))
      .where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.entryId, id))),
    db.select({ name: tags.name }).from(entryTags).innerJoin(tags, eq(tags.id, entryTags.tagId))
      .where(and(eq(entryTags.userId, userId), eq(entryTags.entryId, id))),
    db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, id))),
    db.select().from(vocabLinks).where(and(eq(vocabLinks.userId, userId), or(eq(vocabLinks.fromEntryId, id), eq(vocabLinks.toEntryId, id)))),
    db.select({
      reviewedAt: reviewEvents.reviewedAt, exerciseKind: reviewEvents.exerciseKind, outcome: reviewEvents.outcome, rating: reviewEvents.rating,
      hintsUsed: reviewEvents.hintsUsed, independent: reviewEvents.independent, counted: reviewEvents.countedForSchedule, undoneAt: reviewEvents.undoneAt,
    }).from(reviewEvents).where(and(eq(reviewEvents.userId, userId), eq(reviewEvents.entryId, id))).orderBy(desc(reviewEvents.reviewedAt)).limit(15),
  ]);
  return { entry, examples, topics: memberships, tags: tagRows.map((t) => t.name), state: state[0] ?? null, links, events };
}

export async function updateEntry(db: Db, userId: string, id: string, patch: Partial<EntryInput>, baseVersion: number) {
  const data = entryInputSchema.partial().parse(patch);
  const [current] = await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), eq(vocabEntries.id, id)));
  if (!current) throw notFound("Word not found");
  if (current.version !== baseVersion) {
    throw conflict("This word was changed elsewhere. Reload to see the newer version before saving.", { current });
  }
  if (data.topicIds) await assertTopicsOwned(db, userId, data.topicIds);
  const { examples, topicIds, tags: tagNames, ...fields } = data;
  if (fields.headword) {
    const dupe = await findByNormalized(db, userId, fields.headword, fields.partOfSpeech ?? current.partOfSpeech);
    if (dupe && dupe.id !== id && (dupe.partOfSpeech ?? "") === ((fields.partOfSpeech ?? current.partOfSpeech) ?? "")) {
      throw conflict(`“${dupe.headword}” already exists`, { entryId: dupe.id });
    }
  }
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(vocabEntries)
      .set({
        ...fields,
        ...(fields.headword ? { normalized: normalizeHeadword(fields.headword) } : {}),
        version: current.version + 1,
        updatedAt: new Date(),
      } as Partial<typeof vocabEntries.$inferInsert>)
      .where(and(eq(vocabEntries.id, id), eq(vocabEntries.userId, userId), eq(vocabEntries.version, baseVersion)))
      .returning();
    if (!updated.length) throw conflict("This word was changed elsewhere. Reload and try again.");
    if (examples) {
      await tx.delete(vocabExamples).where(and(eq(vocabExamples.userId, userId), eq(vocabExamples.entryId, id)));
      if (examples.length) {
        await tx.insert(vocabExamples).values(examples.map((ex) => ({ userId, entryId: id, text: ex.text, kind: ex.kind, origin: "user" })));
      }
    }
    if (topicIds) {
      await tx.delete(topicMemberships).where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.entryId, id)));
      if (topicIds.length) await tx.insert(topicMemberships).values(topicIds.map((topicId) => ({ userId, entryId: id, topicId })));
    }
    if (tagNames) await setTags(tx as unknown as Db, userId, id, tagNames);
    return updated[0];
  });
}

export async function deleteEntries(db: Db, userId: string, ids: string[]) {
  if (!ids.length) return 0;
  const res = await db.delete(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, ids))).returning({ id: vocabEntries.id });
  return res.length;
}

// ---------------------------------------------------------------- lists & search

export type SmartList = "all" | "recent" | "new" | "due" | "difficult" | "forgotten" | "mastered" | "favorites";

export async function listEntries(
  db: Db,
  userId: string,
  opts: { q?: string; topicId?: string; tag?: string; list?: SmartList; limit?: number; offset?: number; now?: Date; dueBefore?: Date },
) {
  const conds: SQL[] = [eq(vocabEntries.userId, userId)];
  const now = opts.now ?? new Date();
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(
        ilike(vocabEntries.headword, like),
        ilike(vocabEntries.translationDe, like),
        ilike(vocabEntries.definitionEn, like),
        ilike(vocabEntries.notes, like),
        sql`${vocabEntries.collocations}::text ilike ${like}`,
        sql`${vocabEntries.synonyms}::text ilike ${like}`,
        sql`exists (select 1 from ${vocabExamples} ex where ex.entry_id = ${vocabEntries.id} and ex.text ilike ${like})`,
      )!,
    );
  }
  if (opts.topicId) {
    // the topic itself or any direct subtopic
    conds.push(sql`exists (select 1 from ${topicMemberships} tm join ${topics} t on t.id = tm.topic_id
      where tm.entry_id = ${vocabEntries.id} and (tm.topic_id = ${opts.topicId} or t.parent_id = ${opts.topicId}))`);
  }
  if (opts.tag) {
    conds.push(sql`exists (select 1 from ${entryTags} et join ${tags} t on t.id = et.tag_id where et.entry_id = ${vocabEntries.id} and t.name = ${opts.tag.toLowerCase()})`);
  }
  switch (opts.list) {
    case "recent":
      conds.push(sql`${vocabEntries.createdAt} > ${new Date(now.getTime() - 7 * 86400000)}`);
      break;
    case "new":
      conds.push(sql`${learningStates.state} = 0`);
      break;
    case "due":
      conds.push(sql`${learningStates.state} <> 0 and ${learningStates.due} < ${opts.dueBefore ?? now}`);
      break;
    case "difficult":
      conds.push(sql`(${learningStates.markedDifficult} or ${learningStates.lapses} >= 2)`);
      break;
    case "forgotten":
      conds.push(sql`${learningStates.lapses} >= 4`);
      break;
    case "mastered":
      conds.push(sql`${learningStates.stability} >= 60`);
      break;
    case "favorites":
      conds.push(eq(vocabEntries.favorite, true));
      break;
  }
  const rows = await db
    .select({ entry: vocabEntries, state: learningStates })
    .from(vocabEntries)
    .leftJoin(learningStates, and(eq(learningStates.entryId, vocabEntries.id), eq(learningStates.userId, userId)))
    .where(and(...conds))
    .orderBy(opts.list === "recent" ? desc(vocabEntries.createdAt) : asc(vocabEntries.normalized))
    .limit(Math.min(opts.limit ?? 200, 1000))
    .offset(opts.offset ?? 0);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(vocabEntries)
    .leftJoin(learningStates, and(eq(learningStates.entryId, vocabEntries.id), eq(learningStates.userId, userId)))
    .where(and(...conds));
  return { rows, total: count };
}

/** Short excerpt of `text` around the first match of `query` (case-insensitive). */
export function snippetAround(text: string, query: string, radius = 60) {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export async function globalSearch(db: Db, userId: string, q: string) {
  const query = q.trim();
  if (!query) return { entries: [], topics: [], tags: [], drafts: [] };
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [{ rows }, topicRows, tagRows, draftRows] = await Promise.all([
    listEntries(db, userId, { q: query, limit: 25 }),
    db.select().from(topics).where(and(eq(topics.userId, userId), ilike(topics.name, like))).limit(10),
    db.select().from(tags).where(and(eq(tags.userId, userId), ilike(tags.name, like))).limit(10),
    // Writing drafts and notes: titles and bodies.
    db.select({ id: writingDrafts.id, title: writingDrafts.title, body: writingDrafts.body, updatedAt: writingDrafts.updatedAt }).from(writingDrafts)
      .where(and(eq(writingDrafts.userId, userId), or(ilike(writingDrafts.title, like), ilike(writingDrafts.body, like))))
      .orderBy(desc(writingDrafts.updatedAt)).limit(10),
  ]);
  const norm = normalizeHeadword(query);
  const entries = rows
    .map((r) => r.entry)
    .sort((a, b) => Number(b.normalized.startsWith(norm)) - Number(a.normalized.startsWith(norm)));
  const drafts = draftRows.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt, snippet: snippetAround(d.body, query) }));
  return { entries, topics: topicRows, tags: tagRows, drafts };
}

// ---------------------------------------------------------------- duplicates

export type DuplicateMatch = { entryId: string; headword: string; kind: "exact" | "near" };

export async function findDuplicates(db: Db, userId: string, headwords: string[]): Promise<Map<string, DuplicateMatch>> {
  const all = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword, normalized: vocabEntries.normalized })
    .from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const byNorm = new Map(all.map((e) => [e.normalized, e]));
  const out = new Map<string, DuplicateMatch>();
  for (const h of headwords) {
    const n = normalizeHeadword(h);
    const exact = byNorm.get(n);
    if (exact) {
      out.set(h, { entryId: exact.id, headword: exact.headword, kind: "exact" });
      continue;
    }
    if (n.length < 5) continue;
    const near = all.find((e) => Math.abs(e.normalized.length - n.length) <= 2 && levenshtein(e.normalized, n, 2) <= (n.length > 9 ? 2 : 1));
    if (near) out.set(h, { entryId: near.id, headword: near.headword, kind: "near" });
  }
  return out;
}

// ---------------------------------------------------------------- topics

export type TopicNode = { id: string; name: string; parentId: string | null; kind: string; description: string | null; count: number; children: TopicNode[]; isSample: boolean };

export async function topicTree(db: Db, userId: string): Promise<TopicNode[]> {
  const rows = await db
    .select({
      id: topics.id, name: topics.name, parentId: topics.parentId, kind: topics.kind, description: topics.description, isSample: topics.isSample,
      count: sql<number>`(select count(*)::int from ${topicMemberships} tm where tm.topic_id = ${topics.id})`,
    })
    .from(topics)
    .where(eq(topics.userId, userId))
    .orderBy(asc(topics.name));
  const nodes = new Map<string, TopicNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: TopicNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export const topicInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: z.string().uuid().nullish(),
  kind: z.enum(["topic", "collection"]).default("topic"),
  description: z.string().trim().max(300).nullish(),
});

export async function getOrCreateTopic(db: Db, userId: string, name: string, parentId: string | null = null, isSample = false) {
  const clean = name.trim().slice(0, 80);
  const where = and(eq(topics.userId, userId), sql`lower(${topics.name}) = lower(${clean})`, parentId ? eq(topics.parentId, parentId) : isNull(topics.parentId));
  const [existing] = await db.select().from(topics).where(where);
  if (existing) return existing;
  const [row] = await db.insert(topics).values({ userId, name: clean, parentId, isSample }).returning();
  return row;
}

export async function createTopic(db: Db, userId: string, input: z.input<typeof topicInputSchema>) {
  const data = topicInputSchema.parse(input);
  if (data.parentId) await assertTopicsOwned(db, userId, [data.parentId]);
  const [row] = await db.insert(topics).values({ userId, name: data.name, parentId: data.parentId ?? null, kind: data.kind, description: data.description ?? null }).returning();
  return row;
}

export async function updateTopic(db: Db, userId: string, id: string, patch: Partial<z.input<typeof topicInputSchema>>) {
  const data = topicInputSchema.partial().parse(patch);
  await assertTopicsOwned(db, userId, [id]);
  if (data.parentId) {
    await assertTopicsOwned(db, userId, [data.parentId]);
    // prevent cycles
    let cursor: string | null = data.parentId;
    while (cursor) {
      if (cursor === id) throw badRequest("A topic cannot be moved inside itself");
      const rows: { parentId: string | null }[] = await db.select({ parentId: topics.parentId }).from(topics).where(eq(topics.id, cursor));
      cursor = rows[0]?.parentId ?? null;
    }
  }
  const [row] = await db.update(topics).set(data).where(and(eq(topics.userId, userId), eq(topics.id, id))).returning();
  return row;
}

/** Delete a topic. Words stay in the vocabulary (memberships are removed); subtopics move up a level. */
export async function deleteTopic(db: Db, userId: string, id: string) {
  await assertTopicsOwned(db, userId, [id]);
  const [t] = await db.select().from(topics).where(eq(topics.id, id));
  await db.update(topics).set({ parentId: t.parentId }).where(and(eq(topics.userId, userId), eq(topics.parentId, id)));
  await db.delete(topics).where(and(eq(topics.userId, userId), eq(topics.id, id)));
}

/** Merge `sourceId` into `targetId`: memberships and subtopics move, source is deleted. */
export async function mergeTopics(db: Db, userId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw badRequest("Choose two different topics");
  await assertTopicsOwned(db, userId, [sourceId, targetId]);
  await db.transaction(async (tx) => {
    await tx.execute(sql`insert into topic_memberships (user_id, entry_id, topic_id)
      select user_id, entry_id, ${targetId} from topic_memberships where topic_id = ${sourceId} and user_id = ${userId}
      on conflict do nothing`);
    await tx.update(topics).set({ parentId: targetId }).where(and(eq(topics.userId, userId), eq(topics.parentId, sourceId)));
    await tx.delete(topics).where(and(eq(topics.userId, userId), eq(topics.id, sourceId)));
  });
}

export async function setMembership(db: Db, userId: string, entryIds: string[], topicId: string, action: "add" | "remove" | "move", fromTopicId?: string) {
  await assertTopicsOwned(db, userId, [topicId, ...(fromTopicId ? [fromTopicId] : [])]);
  const owned = await db.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, entryIds)));
  const ids = owned.map((o) => o.id);
  if (!ids.length) return 0;
  if (action === "remove") {
    await db.delete(topicMemberships).where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.topicId, topicId), inArray(topicMemberships.entryId, ids)));
    return ids.length;
  }
  if (action === "move" && fromTopicId) {
    await db.delete(topicMemberships).where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.topicId, fromTopicId), inArray(topicMemberships.entryId, ids)));
  }
  await db.insert(topicMemberships).values(ids.map((entryId) => ({ userId, entryId, topicId }))).onConflictDoNothing();
  return ids.length;
}

/**
 * Split a topic: create a subtopic inside it and move the selected words
 * (direct members of the topic) into the subtopic.
 */
export async function splitTopic(db: Db, userId: string, topicId: string, input: { name: string; entryIds: string[] }) {
  await assertTopicsOwned(db, userId, [topicId]);
  if (!input.entryIds.length) throw badRequest("Select the words to move into the new subtopic");
  const members = await db.select({ entryId: topicMemberships.entryId }).from(topicMemberships)
    .where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.topicId, topicId), inArray(topicMemberships.entryId, input.entryIds)));
  if (!members.length) throw badRequest("None of the selected words belong directly to this topic");
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    const sub = await createTopic(tx, userId, { name: input.name, parentId: topicId });
    const moved = await setMembership(tx, userId, members.map((m) => m.entryId), sub.id, "move", topicId);
    return { topic: sub, moved };
  });
}

export async function listTags(db: Db, userId: string) {
  return db
    .select({ name: tags.name, count: sql<number>`(select count(*)::int from ${entryTags} et where et.tag_id = ${tags.id})` })
    .from(tags)
    .where(eq(tags.userId, userId))
    .orderBy(asc(tags.name));
}
