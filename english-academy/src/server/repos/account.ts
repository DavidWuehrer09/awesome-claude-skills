import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as s from "@/db/schema";
import { SAMPLE_WORDS } from "@/domain/vocab/sample";
import { normalizeHeadword } from "@/lib/text";
import { verifyPassword } from "../auth";
import { HttpError } from "../http";
import { getOrCreateTopic } from "./vocab";

/** Load the sample collection (idempotent: existing words are left untouched). */
export async function loadSample(db: Db, userId: string) {
  let created = 0;
  for (const w of SAMPLE_WORDS) {
    const parent = await getOrCreateTopic(db, userId, w.topic[0], null, true);
    const child = await getOrCreateTopic(db, userId, w.topic[1], parent.id, true);
    const norm = normalizeHeadword(w.headword);
    const [existing] = await db.select({ id: s.vocabEntries.id }).from(s.vocabEntries)
      .where(and(eq(s.vocabEntries.userId, userId), eq(s.vocabEntries.normalized, norm)));
    if (existing) continue;
    const [row] = await db.insert(s.vocabEntries).values({
      userId, headword: w.headword, normalized: norm, partOfSpeech: w.partOfSpeech, translationDe: w.translationDe, definitionEn: w.definitionEn,
      cefr: w.cefr, register: w.register ?? null, collocations: w.collocations, synonyms: w.synonyms, antonyms: w.antonyms ?? [],
      wordFamily: w.wordFamily ?? [], confusables: w.confusables ?? [], commonMistakes: w.commonMistakes ?? [], isSample: true, source: "Sample collection",
    }).returning();
    await db.insert(s.vocabExamples).values(w.examples.map((e) => ({ userId, entryId: row.id, text: e.text, kind: e.kind, origin: "sample" })));
    await db.insert(s.topicMemberships).values({ userId, entryId: row.id, topicId: child.id });
    await db.insert(s.learningStates).values({ userId, entryId: row.id, due: new Date() });
    created++;
  }
  return { created };
}

export async function removeSample(db: Db, userId: string) {
  const removed = await db.delete(s.vocabEntries).where(and(eq(s.vocabEntries.userId, userId), eq(s.vocabEntries.isSample, true))).returning({ id: s.vocabEntries.id });
  await db.delete(s.topics).where(and(eq(s.topics.userId, userId), eq(s.topics.isSample, true)));
  return { removed: removed.length };
}

/** Everything stored about the user, as JSON (GDPR-style export). Secrets are excluded. */
export async function exportAccount(db: Db, userId: string) {
  const by = <T extends { userId: unknown }>(table: T) => db.select().from(table as never).where(eq((table as unknown as { userId: typeof s.users.id }).userId, userId));
  const [user] = await db.select({ id: s.users.id, email: s.users.email, displayName: s.users.displayName, createdAt: s.users.createdAt }).from(s.users).where(eq(s.users.id, userId));
  return {
    exportedAt: new Date().toISOString(),
    format: "english-academy-export@1",
    user,
    settings: await by(s.userSettings),
    topics: await by(s.topics),
    vocabulary: await by(s.vocabEntries),
    examples: await by(s.vocabExamples),
    topicMemberships: await by(s.topicMemberships),
    tags: await by(s.tags),
    entryTags: await by(s.entryTags),
    links: await by(s.vocabLinks),
    learningStates: await by(s.learningStates),
    reviewEvents: await by(s.reviewEvents),
    studySessions: await by(s.studySessions),
    learnerSkills: await by(s.learnerSkills),
    writingPrompts: await by(s.writingPrompts),
    writingDrafts: await by(s.writingDrafts),
    writingSubmissions: await by(s.writingSubmissions),
    writingAssessments: await by(s.writingAssessments),
    feedbackResponses: await by(s.feedbackResponses),
    writingErrorPatterns: await by(s.writingErrorPatterns),
    tutorConversations: await by(s.tutorConversations),
    tutorMessages: await by(s.tutorMessages),
    examMaterials: await by(s.examMaterials),
    examCourseProfile: await by(s.examProfileEntries),
    exams: await by(s.exams),
    examAttempts: await by(s.examAttempts),
    examAssessments: await by(s.examAssessments),
  };
}

export async function deleteAccount(db: Db, userId: string, password: string) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!u || !(await verifyPassword(password, u.passwordHash))) throw new HttpError(403, "Password incorrect", "forbidden");
  await db.delete(s.users).where(eq(s.users.id, userId)); // cascades to every user-owned table
}

/** Reset personalised learner-profile data (keeps vocabulary and history). */
export async function resetLearnerProfile(db: Db, userId: string) {
  await db.delete(s.learnerSkills).where(eq(s.learnerSkills.userId, userId));
  await db.delete(s.writingErrorPatterns).where(eq(s.writingErrorPatterns.userId, userId));
  await db.update(s.learningStates).set({ overconfidence: 0 }).where(eq(s.learningStates.userId, userId));
}
