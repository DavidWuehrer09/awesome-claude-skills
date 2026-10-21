import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiRequests, learningStates, tutorMessages, userSettings, vocabEntries, vocabExamples } from "@/db/schema";
import { freshDb, twoUsers } from "./helpers";

const structured = vi.fn();
vi.mock("@/server/ai/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/anthropic")>()),
  anthropicStructured: (...args: unknown[]) => structured(...args),
}));

const { enrichBatch } = await import("@/server/repos/enrichment");
const { analyseText, toolsData } = await import("@/server/repos/tools");
const { createConversation, getConversation, tutorContext } = await import("@/server/repos/tutor");
const { recommendations } = await import("@/server/repos/progress");
const { createDraft } = await import("@/server/repos/writing");
const { createEntry, createTopic, getEntry, globalSearch, splitTopic, topicTree } = await import("@/server/repos/vocab");

let db: Db;
let close: () => Promise<void>;
let u: Awaited<ReturnType<typeof twoUsers>>;

const enrichData = (definitionEn: string) => ({
  partOfSpeech: "verb", translationDe: "SHOULD NOT OVERWRITE", definitionEn, cefr: "C1", register: "formal", connotation: null,
  collocations: ["closely scrutinise"], synonyms: ["examine"], antonyms: [], wordFamily: [], patterns: [], grammarNotes: null, ipa: null,
  commonMistakes: [], confusables: [], idioms: [], examples: [{ text: "Journalists scrutinise the figures.", kind: "natural" }], uncertainty: null,
});
const usage = { model: "claude-opus-5-5", inputTokens: 100, outputTokens: 50 };

beforeAll(async () => {
  ({ db, close } = await freshDb());
  u = await twoUsers(db);
});
afterAll(() => close());
afterEach(async () => {
  vi.unstubAllEnvs();
  structured.mockReset();
  await db.delete(aiRequests);
});

describe("global search", () => {
  it("finds writing drafts by title and body, only the learner's own", async () => {
    await createDraft(db, u.alice.id, null, "Essay: social media and democracy", "Algorithms may undermine public debate.");
    await createDraft(db, u.alice.id, null, "Notes", "The narrator's unreliable voice creates suspense.");
    await createDraft(db, u.bob.id, null, "Bob on democracy", "Private.");
    const byTitle = await globalSearch(db, u.alice.id, "democracy");
    expect(byTitle.drafts.map((d) => d.title)).toEqual(["Essay: social media and democracy"]);
    const byBody = await globalSearch(db, u.alice.id, "unreliable");
    expect(byBody.drafts).toHaveLength(1);
    expect(byBody.drafts[0].snippet).toContain("unreliable voice");
    expect((await globalSearch(db, u.bob.id, "unreliable")).drafts).toHaveLength(0);
  });
});

describe("split topic", () => {
  it("creates a subtopic and moves only the selected words", async () => {
    const politics = await createTopic(db, u.alice.id, { name: "Politics" });
    const [a, b, c] = await Promise.all(["ballot", "turnout", "lobbying"].map((h) => createEntry(db, u.alice.id, { headword: h, topicIds: [politics.id] })));
    const r = await splitTopic(db, u.alice.id, politics.id, { name: "Elections", entryIds: [a.id, b.id] });
    expect(r.moved).toBe(2);
    const node = (await topicTree(db, u.alice.id)).find((t) => t.id === politics.id)!;
    expect(node.count).toBe(1);
    expect(node.children.map((ch) => [ch.name, ch.count])).toEqual([["Elections", 2]]);
    expect((await getEntry(db, u.alice.id, a.id)).topics.map((t) => t.name)).toEqual(["Elections"]);
    expect((await getEntry(db, u.alice.id, c.id)).topics.map((t) => t.name)).toEqual(["Politics"]);
    await expect(splitTopic(db, u.bob.id, politics.id, { name: "Hijack", entryIds: [c.id] })).rejects.toMatchObject({ status: 404 });
    await expect(splitTopic(db, u.alice.id, politics.id, { name: "Empty", entryIds: [a.id] })).rejects.toMatchObject({ status: 400 });
  });
});

describe("batch enrichment", () => {
  it("fills only empty fields and stops cleanly when the allowance runs out", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
    vi.stubEnv("AI_PLANS", JSON.stringify({ free: { label: "Free", monthly: { exercises: 2, exam_generation: 0, assessment: 0, tutor: 0, documents: 0 }, monthlyUsd: null } }));
    structured.mockImplementation(async () => ({ data: enrichData("to examine carefully"), usage }));
    const entries = await Promise.all(["to scrutinise", "to mitigate", "to exacerbate", "to undermine"].map((h, i) =>
      createEntry(db, u.bob.id, { headword: h, translationDe: i === 0 ? "genau prüfen" : null })));
    const ids = entries.map((e) => e.id);
    const r = await enrichBatch(db, u.bob.id, ids);
    expect(r.enriched).toEqual(ids.slice(0, 2));
    expect(r.stopped).toMatchObject({ code: "quota" });
    expect(r.stopped!.message).toMatch(/exercises, word help/);
    expect(r.remaining).toEqual(ids.slice(2));
    expect(structured).toHaveBeenCalledTimes(2);
    const first = await getEntry(db, u.bob.id, ids[0]);
    expect(first.entry.translationDe).toBe("genau prüfen"); // learner data kept
    expect(first.entry.definitionEn).toBe("to examine carefully");
    expect(first.entry.collocations).toEqual(["closely scrutinise"]);
    expect(first.entry.enrichment).toMatchObject({ demo: false, provider: "anthropic" });
    expect(first.examples.map((e) => [e.text, (e as { origin: string }).origin])).toEqual([["Journalists scrutinise the figures.", "ai"]]);
    const untouched = await getEntry(db, u.bob.id, ids[3]);
    expect(untouched.entry.definitionEn).toBeNull();
    // Other users' words are ignored.
    expect((await enrichBatch(db, u.alice.id, ids)).enriched).toEqual([]);
  });

  it("never saves demo output", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const e = await createEntry(db, u.bob.id, { headword: "to deliberate" });
    const r = await enrichBatch(db, u.bob.id, [e.id]);
    expect(r).toMatchObject({ demo: true, enriched: [], unchanged: [e.id], stopped: null });
    const [row] = await db.select().from(vocabEntries).where(eq(vocabEntries.id, e.id));
    expect(row.enrichment).toBeNull();
    expect(await db.select().from(vocabExamples).where(eq(vocabExamples.entryId, e.id))).toHaveLength(0);
  });
});

describe("tutor context", () => {
  it("includes the chosen topic and its words, and the collection summary only with consent", async () => {
    const env = await createTopic(db, u.alice.id, { name: "Environment" });
    const w = await createEntry(db, u.alice.id, { headword: "to mitigate", translationDe: "abmildern", collocations: ["mitigate the effects"], topicIds: [env.id] });
    await db.update(learningStates).set({ lapses: 3 }).where(and(eq(learningStates.userId, u.alice.id), eq(learningStates.entryId, w.id)));
    const conv = await createConversation(db, u.alice.id, { topicId: env.id });
    const { conversation } = await getConversation(db, u.alice.id, conv.id);
    const withConsent = await tutorContext(db, u.alice.id, [], conversation.topicId);
    expect(withConsent).toContain("chose the topic “Environment”");
    expect(withConsent).toContain("to mitigate; de: abmildern");
    expect(withConsent).toMatch(/Collection overview: \d+ words in total\. Words per topic: .*Environment \(1\)/);
    expect(withConsent).toMatch(/Weakest words .*to mitigate/);
    await db.update(userSettings).set({ aiProfileConsent: false }).where(eq(userSettings.userId, u.alice.id));
    const without = await tutorContext(db, u.alice.id, [], conversation.topicId);
    expect(without).toContain("Environment");
    expect(without).not.toContain("Collection overview");
    expect(without).not.toContain("Weakest words");
    await db.update(userSettings).set({ aiProfileConsent: true }).where(eq(userSettings.userId, u.alice.id));
    // Bob cannot attach Alice's topic.
    await expect(createConversation(db, u.bob.id, { topicId: env.id })).rejects.toMatchObject({ status: 404 });
  });

  it("lists the learner's words found in tutor replies for 'practise later'", async () => {
    const conv = await createConversation(db, u.alice.id, {});
    const [m] = await db.insert(tutorMessages).values({ userId: u.alice.id, conversationId: conv.id, role: "assistant", content: "Measures that mitigated the damage …" }).returning();
    const { mentions } = await getConversation(db, u.alice.id, conv.id);
    expect(mentions[m.id].map((x) => x.headword)).toEqual(["to mitigate"]);
  });
});

describe("tools", () => {
  it("collects collocations and confusable pairs, and finds inflected words in a text", async () => {
    await createEntry(db, u.alice.id, { headword: "affect", definitionEn: "to influence", confusables: [{ word: "effect", distinction: "affect = verb, effect = noun" }] });
    await createEntry(db, u.alice.id, { headword: "effect", partOfSpeech: "noun", confusables: [{ word: "affect", distinction: "effect is usually the noun" }] });
    const data = await toolsData(db, u.alice.id);
    expect(data.collocations.map((c) => c.headword)).toContain("to mitigate");
    const pair = data.confusables.find((p) => p.key === "affect ↔ effect")!;
    expect(pair.a.id && pair.b.id).toBeTruthy();
    expect(pair.distinctions).toHaveLength(2);
    expect(data.confusables.filter((p) => p.key === "affect ↔ effect")).toHaveLength(1);

    const text = "Governments mitigated the crisis. Meanwhile, Greenpeace demanded transparency and transparency again.";
    const r = await analyseText(db, u.alice.id, text);
    expect(r.found.map((f) => f.headword)).toContain("to mitigate");
    expect(text.slice(r.spans[0].start, r.spans[0].end)).toBe("mitigated");
    expect(r.candidates[0]).toEqual({ word: "transparency", count: 2 });
    const words = r.candidates.map((c) => c.word);
    expect(words).not.toContain("greenpeace"); // only ever capitalised: a name
    expect(words).not.toContain("mitigated");
    expect(words).not.toContain("meanwhile");
  });
});

describe("recommendations", () => {
  it("suggests comparing confusables with lapses and analytical phrases before the exam", async () => {
    const [affect] = await db.select().from(vocabEntries).where(and(eq(vocabEntries.userId, u.alice.id), eq(vocabEntries.normalized, "affect")));
    await db.update(learningStates).set({ lapses: 1 }).where(eq(learningStates.entryId, affect.id));
    const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    await db.update(userSettings).set({ examDate: soon }).where(eq(userSettings.userId, u.alice.id));
    const recs = await recommendations(db, u.alice.id);
    expect(recs.find((r) => r.key === "confusables")).toMatchObject({ href: "/tools?tab=confusables" });
    expect(recs.find((r) => r.key === "analytical-verbs")).toMatchObject({ href: "/tools?tab=phrases" });
    expect((await recommendations(db, u.bob.id)).find((r) => r.key === "confusables")).toBeUndefined();
  });
});
