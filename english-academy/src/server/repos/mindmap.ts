import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { learningStates, topicMemberships, topics, vocabEntries, vocabLinks } from "@/db/schema";
import { masteryLevel } from "@/domain/learning/mastery";
import { normalizeHeadword } from "@/lib/text";
import { RELATIONS } from "../ai/features";
import { runFeature } from "../ai/service";
import { notFound } from "../http";

export type MapNode = {
  id: string;
  kind: "topic" | "subtopic" | "word" | "label";
  label: string;
  entryId?: string;
  partOfSpeech?: string | null;
  level?: string;
  meaning?: string | null;
};
export type MapEdge = { id: string; source: string; target: string; relation: string; note?: string | null; origin: "structure" | "derived" | "ai" | "user"; linkId?: string };

export async function buildMap(db: Db, userId: string, topicId: string) {
  const [root] = await db.select().from(topics).where(and(eq(topics.userId, userId), eq(topics.id, topicId)));
  if (!root) throw notFound("Topic not found");
  const subs = await db.select().from(topics).where(and(eq(topics.userId, userId), eq(topics.parentId, topicId)));
  const topicIds = [root.id, ...subs.map((s) => s.id)];
  const members = await db.select({ entryId: topicMemberships.entryId, topicId: topicMemberships.topicId }).from(topicMemberships)
    .where(and(eq(topicMemberships.userId, userId), inArray(topicMemberships.topicId, topicIds)));
  const entryIds = [...new Set(members.map((m) => m.entryId))];
  const entries = entryIds.length ? await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, entryIds))) : [];
  const states = entryIds.length ? await db.select().from(learningStates).where(and(eq(learningStates.userId, userId), inArray(learningStates.entryId, entryIds))) : [];
  const stateBy = new Map(states.map((s) => [s.entryId, s]));
  const allMine = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword, normalized: vocabEntries.normalized }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const byNorm = new Map(allMine.map((e) => [e.normalized, e]));
  const links = entryIds.length
    ? await db.select().from(vocabLinks).where(and(eq(vocabLinks.userId, userId), or(inArray(vocabLinks.fromEntryId, entryIds), inArray(vocabLinks.toEntryId, entryIds))))
    : [];

  const nodes = new Map<string, MapNode>();
  const edges: MapEdge[] = [];
  nodes.set(`t:${root.id}`, { id: `t:${root.id}`, kind: "topic", label: root.name });
  for (const s of subs) {
    nodes.set(`t:${s.id}`, { id: `t:${s.id}`, kind: "subtopic", label: s.name });
    edges.push({ id: `e:t:${s.id}`, source: `t:${root.id}`, target: `t:${s.id}`, relation: "subtopic", origin: "structure" });
  }
  const wordNode = (id: string) => `w:${id}`;
  for (const e of entries) {
    const st = stateBy.get(e.id);
    nodes.set(wordNode(e.id), {
      id: wordNode(e.id), kind: "word", label: e.headword, entryId: e.id, partOfSpeech: e.partOfSpeech,
      level: st ? masteryLevel(st.mastery, st.stability) : "new", meaning: e.translationDe ?? e.definitionEn,
    });
  }
  for (const m of members) {
    edges.push({ id: `e:m:${m.topicId}:${m.entryId}`, source: `t:${m.topicId}`, target: wordNode(m.entryId), relation: "in topic", origin: "structure" });
  }
  const addLabel = (from: string, label: string, relation: string, note?: string | null, origin: MapEdge["origin"] = "derived", linkId?: string) => {
    const known = byNorm.get(normalizeHeadword(label));
    let target: string;
    if (known && nodes.has(wordNode(known.id))) target = wordNode(known.id);
    else {
      target = `l:${normalizeHeadword(label)}`;
      if (!nodes.has(target)) nodes.set(target, { id: target, kind: "label", label, entryId: known?.id });
    }
    const id = `e:${origin}:${from}:${relation}:${target}`;
    if (!edges.some((x) => x.source === from && x.target === target && x.relation === relation)) edges.push({ id, source: from, target, relation, note, origin, linkId });
  };
  for (const e of entries) {
    const from = wordNode(e.id);
    e.synonyms.slice(0, 2).forEach((s) => addLabel(from, s, "synonym"));
    e.antonyms.slice(0, 2).forEach((s) => addLabel(from, s, "antonym"));
    e.wordFamily.slice(0, 1).forEach((f) => addLabel(from, f.form, "family", f.pos));
    e.collocations.slice(0, 2).forEach((c) => addLabel(from, c, "collocation"));
    e.confusables.slice(0, 2).forEach((c) => addLabel(from, c.word, "contrast", c.distinction));
  }
  for (const l of links) {
    const from = wordNode(l.fromEntryId);
    if (!nodes.has(from)) continue;
    if (l.toEntryId && nodes.has(wordNode(l.toEntryId))) {
      edges.push({ id: `e:link:${l.id}`, source: from, target: wordNode(l.toEntryId), relation: l.relation, note: l.note, origin: l.origin as MapEdge["origin"], linkId: l.id });
    } else if (l.toLabel) {
      addLabel(from, l.toLabel, l.relation, l.note, l.origin as MapEdge["origin"], l.id);
    }
  }
  return { topic: root, nodes: [...nodes.values()], edges };
}

export const linkSchema = z.object({
  fromEntryId: z.string().uuid(),
  toEntryId: z.string().uuid().nullish(),
  toLabel: z.string().trim().min(1).max(80).nullish(),
  relation: z.enum(RELATIONS),
  note: z.string().trim().max(300).nullish(),
}).refine((v) => v.toEntryId || v.toLabel, "A link needs a target word or label");

export async function addLink(db: Db, userId: string, input: z.input<typeof linkSchema>) {
  const data = linkSchema.parse(input);
  const ids = [data.fromEntryId, ...(data.toEntryId ? [data.toEntryId] : [])];
  const own = await db.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, ids)));
  if (own.length !== new Set(ids).size) throw notFound("Word not found");
  const [row] = await db.insert(vocabLinks).values({ userId, ...data, toEntryId: data.toEntryId ?? null, toLabel: data.toLabel ?? null, note: data.note ?? null, origin: "user" }).returning();
  return row;
}

export async function deleteLink(db: Db, userId: string, id: string) {
  const r = await db.delete(vocabLinks).where(and(eq(vocabLinks.userId, userId), eq(vocabLinks.id, id))).returning({ id: vocabLinks.id });
  if (!r.length) throw notFound("Link not found");
}

/** Replace previous AI links for this topic with fresh suggestions; user links are never touched. */
export async function suggestLinks(db: Db, userId: string, topicId: string) {
  const map = await buildMap(db, userId, topicId);
  const words = map.nodes.filter((n) => n.kind === "word");
  if (words.length < 2) return { added: 0, demo: false };
  const { data, meta } = await runFeature(db, userId, "mindmap", {
    topic: map.topic.name, entries: words.map((w) => ({ headword: w.label, meaning: w.meaning ?? null })),
  });
  const byLabel = new Map(words.map((w) => [normalizeHeadword(w.label), w.entryId!]));
  const entryIds = words.map((w) => w.entryId!);
  const userLinks = await db.select().from(vocabLinks).where(and(eq(vocabLinks.userId, userId), eq(vocabLinks.origin, "user"), inArray(vocabLinks.fromEntryId, entryIds)));
  await db.delete(vocabLinks).where(and(eq(vocabLinks.userId, userId), eq(vocabLinks.origin, "ai"), inArray(vocabLinks.fromEntryId, entryIds)));
  let added = 0;
  for (const l of data.links) {
    const from = byLabel.get(normalizeHeadword(l.from));
    if (!from) continue;
    const toId = byLabel.get(normalizeHeadword(l.to)) ?? null;
    const dup = userLinks.some((u) => u.fromEntryId === from && u.relation === l.relation && (u.toEntryId === toId || normalizeHeadword(u.toLabel ?? "") === normalizeHeadword(l.to)));
    if (dup) continue;
    await db.insert(vocabLinks).values({ userId, fromEntryId: from, toEntryId: toId, toLabel: toId ? null : l.to.slice(0, 80), relation: l.relation, note: l.note.slice(0, 300), origin: "ai" });
    added++;
  }
  return { added, demo: meta.demo };
}
