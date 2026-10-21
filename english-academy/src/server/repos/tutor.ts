import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { learningStates, topicMemberships, topics, tutorConversations, tutorMessages, vocabEntries, writingErrorPatterns } from "@/db/schema";
import { inflectionPattern, normalizeHeadword } from "@/lib/text";
import { TEACHING_PRINCIPLES } from "../ai/features";
import { notFound } from "../http";
import { getSettings } from "./learning";

export const TUTOR_POLICY = `${TEACHING_PRINCIPLES}
You are the learner's personal vocabulary and writing tutor. Teaching cycle for mistakes:
1) identify the issue, 2) explain the underlying principle, 3) give a hint or focused question when the learner could fix it themselves, 4) let them try, 5) evaluate the revision, 6) give a model version only when useful.
Do not simply hand over a polished replacement. Compare near-synonyms by meaning, register, intensity, collocations and typical contexts. Offer short mini-exercises or quizzes when appropriate and wait for the answer. Keep answers focused and readable on a phone (short paragraphs, small lists). Reply in English unless the learner writes in German and asks for German. When the learner struggles with one of their saved words, name that word explicitly so they can save it for later practice.`;

export async function listConversations(db: Db, userId: string) {
  return db.select().from(tutorConversations).where(eq(tutorConversations.userId, userId)).orderBy(desc(tutorConversations.updatedAt)).limit(50);
}

export const conversationSchema = z.object({
  title: z.string().trim().max(120).optional(),
  topicId: z.string().uuid().nullish(),
  attachedEntryIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function createConversation(db: Db, userId: string, input: z.input<typeof conversationSchema>) {
  const data = conversationSchema.parse(input);
  const ids = data.attachedEntryIds?.length
    ? (await db.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, data.attachedEntryIds)))).map((r) => r.id)
    : [];
  if (data.topicId) {
    const [t] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.userId, userId), eq(topics.id, data.topicId)));
    if (!t) throw notFound("Topic not found");
  }
  const [c] = await db.insert(tutorConversations).values({ userId, title: data.title || "New conversation", topicId: data.topicId ?? null, attachedEntryIds: ids }).returning();
  return c;
}

export async function getConversation(db: Db, userId: string, id: string) {
  const [c] = await db.select().from(tutorConversations).where(and(eq(tutorConversations.userId, userId), eq(tutorConversations.id, id)));
  if (!c) throw notFound("Conversation not found");
  const messages = await db.select().from(tutorMessages).where(eq(tutorMessages.conversationId, id)).orderBy(asc(tutorMessages.createdAt));
  const attached = c.attachedEntryIds.length
    ? await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, c.attachedEntryIds)))
    : [];
  const [topic] = c.topicId ? await db.select({ id: topics.id, name: topics.name }).from(topics).where(and(eq(topics.userId, userId), eq(topics.id, c.topicId))) : [];
  return { conversation: c, messages, attached, topic: topic ?? null, mentions: await wordsInReplies(db, userId, messages) };
}

/**
 * The learner's own words that appear in each tutor reply, so the learner can
 * save them for later practice with one click ("practise later").
 */
export async function wordsInReplies(db: Db, userId: string, messages: { id: string; role: string; content: string }[]) {
  const replies = messages.filter((m) => m.role === "assistant" && m.content);
  if (!replies.length) return {};
  const rows = await db.select({ id: vocabEntries.id, headword: vocabEntries.headword, difficult: learningStates.markedDifficult })
    .from(vocabEntries)
    .leftJoin(learningStates, and(eq(learningStates.entryId, vocabEntries.id), eq(learningStates.userId, userId)))
    .where(eq(vocabEntries.userId, userId));
  const patterns = rows.filter((r) => normalizeHeadword(r.headword).length > 3)
    .map((r) => ({ ...r, difficult: r.difficult ?? false, re: inflectionPattern(r.headword) }))
    .filter((r) => r.re);
  const out: Record<string, { id: string; headword: string; difficult: boolean }[]> = {};
  for (const m of replies) {
    const found = patterns.filter((p) => p.re!.test(m.content)).slice(0, 12);
    if (found.length) out[m.id] = found.map(({ id, headword, difficult }) => ({ id, headword, difficult }));
  }
  return out;
}

export async function updateConversation(db: Db, userId: string, id: string, input: z.input<typeof conversationSchema>) {
  const data = conversationSchema.parse(input);
  const ids = data.attachedEntryIds
    ? (await db.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, data.attachedEntryIds.length ? data.attachedEntryIds : ["00000000-0000-0000-0000-000000000000"])))).map((r) => r.id)
    : undefined;
  if (data.topicId) {
    const [t] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.userId, userId), eq(topics.id, data.topicId)));
    if (!t) throw notFound("Topic not found");
  }
  const [c] = await db.update(tutorConversations).set({
    ...(data.title ? { title: data.title } : {}),
    ...(data.topicId !== undefined ? { topicId: data.topicId } : {}),
    ...(ids ? { attachedEntryIds: ids } : {}),
    updatedAt: new Date(),
  }).where(and(eq(tutorConversations.userId, userId), eq(tutorConversations.id, id))).returning();
  if (!c) throw notFound("Conversation not found");
  return c;
}

export async function deleteConversation(db: Db, userId: string, id: string) {
  const r = await db.delete(tutorConversations).where(and(eq(tutorConversations.userId, userId), eq(tutorConversations.id, id))).returning({ id: tutorConversations.id });
  if (!r.length) throw notFound("Conversation not found");
}

export async function addMessage(db: Db, userId: string, conversationId: string, role: "user" | "assistant", content: string, isDemo = false) {
  const [m] = await db.insert(tutorMessages).values({ userId, conversationId, role, content, isDemo }).returning();
  const update: Partial<typeof tutorConversations.$inferInsert> = { updatedAt: new Date() };
  if (role === "user") {
    const [c] = await db.select().from(tutorConversations).where(eq(tutorConversations.id, conversationId));
    if (c?.title === "New conversation") update.title = content.slice(0, 60);
  }
  await db.update(tutorConversations).set(update).where(eq(tutorConversations.id, conversationId));
  return m;
}

type EntryRow = typeof vocabEntries.$inferSelect;

function describeEntry(e: EntryRow) {
  return [
    `${e.headword}${e.partOfSpeech ? ` (${e.partOfSpeech})` : ""}`,
    e.translationDe && `de: ${e.translationDe}`,
    e.definitionEn && `def: ${e.definitionEn}`,
    e.collocations.length && `collocations: ${e.collocations.slice(0, 5).join(", ")}`,
    e.register && `register: ${e.register}`,
  ].filter(Boolean).join("; ");
}

/** Compact overview of the whole collection: size, words per topic and the weakest words. */
export async function collectionSummary(db: Db, userId: string) {
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const perTopic = await db.select({ name: topics.name, n: sql<number>`count(${topicMemberships.entryId})::int` })
    .from(topics).leftJoin(topicMemberships, eq(topicMemberships.topicId, topics.id))
    .where(eq(topics.userId, userId)).groupBy(topics.id, topics.name).orderBy(desc(sql`count(${topicMemberships.entryId})`)).limit(15);
  const weakest = await db.select({ headword: vocabEntries.headword, lapses: learningStates.lapses, difficult: learningStates.markedDifficult })
    .from(learningStates).innerJoin(vocabEntries, eq(vocabEntries.id, learningStates.entryId))
    .where(and(eq(learningStates.userId, userId), or(sql`${learningStates.lapses} >= 2`, eq(learningStates.markedDifficult, true))))
    .orderBy(desc(learningStates.lapses)).limit(10);
  return { total, perTopic: perTopic.filter((t) => t.n > 0), weakest };
}

/** Build the system prompt with the learner's context (only data they agreed to share). */
export async function tutorContext(db: Db, userId: string, attached: EntryRow[], topicId: string | null = null) {
  const settings = await getSettings(db, userId);
  const parts = [TUTOR_POLICY];
  if (attached.length) parts.push(`Words the learner attached to this conversation:\n${attached.map(describeEntry).join("\n")}`);
  if (topicId) {
    const [topic] = await db.select({ name: topics.name }).from(topics).where(and(eq(topics.userId, userId), eq(topics.id, topicId)));
    if (topic) {
      const words = await db.select({ entry: vocabEntries }).from(topicMemberships)
        .innerJoin(vocabEntries, eq(vocabEntries.id, topicMemberships.entryId))
        .where(and(eq(topicMemberships.userId, userId), eq(topicMemberships.topicId, topicId))).orderBy(asc(vocabEntries.normalized)).limit(40);
      parts.push(`The learner chose the topic “${topic.name}” for this conversation. Keep examples and questions within this topic where natural.${words.length ? `\nTheir words in this topic:\n${words.map((w) => describeEntry(w.entry)).join("\n")}` : ""}`);
    }
  }
  if (settings.aiProfileConsent) {
    const summary = await collectionSummary(db, userId);
    if (summary.total) {
      parts.push(`Collection overview: ${summary.total} words in total.${summary.perTopic.length ? ` Words per topic: ${summary.perTopic.map((t) => `${t.name} (${t.n})`).join(", ")}.` : ""}`);
    }
    if (summary.weakest.length) {
      parts.push(`Weakest words (often forgotten or marked difficult): ${summary.weakest.map((w) => w.headword).join(", ")}`);
    }
    const patterns = await db.select({ category: writingErrorPatterns.category }).from(writingErrorPatterns)
      .where(eq(writingErrorPatterns.userId, userId)).orderBy(desc(writingErrorPatterns.submissionsAffected)).limit(5);
    if (patterns.length) parts.push(`Recurring writing weaknesses: ${patterns.map((p) => p.category).join(", ")}`);
    parts.push(`Target level: ${settings.targetLevel}.`);
  }
  return parts.join("\n\n");
}

/** Demo-mode tutor: answers only from the learner's own saved data, clearly labelled. */
export async function demoTutorReply(db: Db, userId: string, question: string, attached: EntryRow[]) {
  const all = await db.select().from(vocabEntries).where(eq(vocabEntries.userId, userId));
  const q = ` ${question.toLowerCase()} `;
  const mentioned = all.filter((e) => q.includes(` ${normalizeHeadword(e.headword)}`) || attached.some((a) => a.id === e.id));
  const lines = ["*Demo mode — no AI provider is configured, so I can only show what is saved in your vocabulary.*", ""];
  if (!mentioned.length) {
    lines.push("I could not find a word from your vocabulary in your question. Attach words to the conversation or configure an AI provider in Settings for real explanations.");
    return lines.join("\n");
  }
  for (const e of mentioned.slice(0, 4)) {
    lines.push(`**${e.headword}**${e.partOfSpeech ? ` (${e.partOfSpeech})` : ""}`);
    if (e.definitionEn) lines.push(`- Meaning: ${e.definitionEn}`);
    if (e.translationDe) lines.push(`- German: ${e.translationDe}`);
    if (e.collocations.length) lines.push(`- Collocations: ${e.collocations.join(", ")}`);
    for (const c of e.confusables) lines.push(`- vs. *${c.word}*: ${c.distinction}`);
    lines.push("");
  }
  lines.push("Try it: write one sentence with each word and ask me to check it once AI is configured.");
  return lines.join("\n");
}
