import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { learningStates, topics, tutorConversations, tutorMessages, vocabEntries, writingErrorPatterns } from "@/db/schema";
import { normalizeHeadword } from "@/lib/text";
import { TEACHING_PRINCIPLES } from "../ai/features";
import { notFound } from "../http";
import { getSettings } from "./learning";

export const TUTOR_POLICY = `${TEACHING_PRINCIPLES}
You are the learner's personal vocabulary and writing tutor. Teaching cycle for mistakes:
1) identify the issue, 2) explain the underlying principle, 3) give a hint or focused question when the learner could fix it themselves, 4) let them try, 5) evaluate the revision, 6) give a model version only when useful.
Do not simply hand over a polished replacement. Compare near-synonyms by meaning, register, intensity, collocations and typical contexts. Offer short mini-exercises or quizzes when appropriate and wait for the answer. Keep answers focused and readable on a phone (short paragraphs, small lists). Reply in English unless the learner writes in German and asks for German.`;

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
  return { conversation: c, messages, attached };
}

export async function updateConversation(db: Db, userId: string, id: string, input: z.input<typeof conversationSchema>) {
  const data = conversationSchema.parse(input);
  const ids = data.attachedEntryIds
    ? (await db.select({ id: vocabEntries.id }).from(vocabEntries).where(and(eq(vocabEntries.userId, userId), inArray(vocabEntries.id, data.attachedEntryIds.length ? data.attachedEntryIds : ["00000000-0000-0000-0000-000000000000"])))).map((r) => r.id)
    : undefined;
  const [c] = await db.update(tutorConversations).set({
    ...(data.title ? { title: data.title } : {}),
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

/** Build the system prompt with the learner's context (only data they agreed to share). */
export async function tutorContext(db: Db, userId: string, attached: EntryRow[]) {
  const settings = await getSettings(db, userId);
  const parts = [TUTOR_POLICY];
  if (attached.length) parts.push(`Words the learner attached to this conversation:\n${attached.map(describeEntry).join("\n")}`);
  if (settings.aiProfileConsent) {
    const weak = await db.select({ headword: vocabEntries.headword, lapses: learningStates.lapses })
      .from(learningStates).innerJoin(vocabEntries, eq(vocabEntries.id, learningStates.entryId))
      .where(and(eq(learningStates.userId, userId))).orderBy(desc(learningStates.lapses)).limit(8);
    const hard = weak.filter((w) => w.lapses >= 2).map((w) => w.headword);
    if (hard.length) parts.push(`Words the learner often forgets: ${hard.join(", ")}`);
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
