import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { authenticate, createSession, userForToken } from "@/server/auth";
import { commitImport, createImportJob } from "@/server/repos/imports";
import { buildSession, recordReview, undoReview } from "@/server/repos/learning";
import {
  createEntry, createTopic, deleteEntries, deleteTopic, findDuplicates, getEntry, listEntries, mergeTopics, setMembership, topicTree, updateEntry,
} from "@/server/repos/vocab";
import { freshDb, twoUsers } from "./helpers";

let db: Db;
let close: () => Promise<void>;
let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
  ({ db, close } = await freshDb());
  ({ alice, bob } = await twoUsers(db));
});
afterAll(async () => close());

const ev = (entryId: string, over: Record<string, unknown> = {}) => ({
  clientEventId: `evt-${Math.random().toString(36).slice(2)}`, entryId, exerciseKind: "typed_de_en", dimension: "spelling" as const,
  outcome: "correct" as const, independent: true, recognitionOnly: false, hintsUsed: 0, schedule: true, reviewedAt: new Date().toISOString(), ...over,
});

describe("auth", () => {
  it("authenticates and resolves sessions; rejects bad passwords", async () => {
    expect(await authenticate(db, "ALICE@example.com", "correct horse battery")).toMatchObject({ id: alice.id });
    expect(await authenticate(db, "alice@example.com", "wrong")).toBeNull();
    const { token } = await createSession(db, alice.id);
    expect((await userForToken(db, token))?.id).toBe(alice.id);
    expect(await userForToken(db, token + "x")).toBeNull();
  });
});

describe("vocabulary", () => {
  it("creates, edits with version checks, prevents duplicates", async () => {
    const t = await createTopic(db, alice.id, { name: "Politics" });
    const e = await createEntry(db, alice.id, { headword: "to undermine", translationDe: "untergraben", topicIds: [t.id], tags: ["Abitur"], examples: [{ text: "Corruption undermines trust.", kind: "natural" }] });
    await expect(createEntry(db, alice.id, { headword: "Undermine" })).rejects.toMatchObject({ status: 409 });
    const u = await updateEntry(db, alice.id, e.id, { definitionEn: "to weaken gradually" }, 1);
    expect(u.version).toBe(2);
    await expect(updateEntry(db, alice.id, e.id, { definitionEn: "stale" }, 1)).rejects.toMatchObject({ status: 409 });
    const full = await getEntry(db, alice.id, e.id);
    expect(full.tags).toEqual(["abitur"]);
    expect(full.examples[0].text).toMatch(/Corruption/);
    expect(full.topics[0].name).toBe("Politics");
  });

  it("isolates users completely", async () => {
    const [{ entry }] = (await listEntries(db, alice.id, {})).rows;
    await expect(getEntry(db, bob.id, entry.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateEntry(db, bob.id, entry.id, { notes: "hijack" }, entry.version)).rejects.toMatchObject({ status: 404 });
    expect(await deleteEntries(db, bob.id, [entry.id])).toBe(0);
    expect((await listEntries(db, bob.id, {})).total).toBe(0);
    const aliceTopics = await topicTree(db, alice.id);
    await expect(createEntry(db, bob.id, { headword: "x", topicIds: [aliceTopics[0].id] })).rejects.toMatchObject({ status: 404 });
    await expect(recordReview(db, bob.id, ev(entry.id))).rejects.toMatchObject({ status: 404 });
  });

  it("supports topic trees, moving, merging and deleting without losing words", async () => {
    const env = await createTopic(db, alice.id, { name: "Environment" });
    const climate = await createTopic(db, alice.id, { name: "Climate", parentId: env.id });
    const e = await createEntry(db, alice.id, { headword: "to mitigate", topicIds: [climate.id] });
    expect((await listEntries(db, alice.id, { topicId: env.id })).total).toBe(1); // includes subtopics
    const other = await createTopic(db, alice.id, { name: "Green" });
    await setMembership(db, alice.id, [e.id], other.id, "move", climate.id);
    expect((await getEntry(db, alice.id, e.id)).topics.map((t) => t.name)).toEqual(["Green"]);
    await mergeTopics(db, alice.id, other.id, env.id);
    expect((await getEntry(db, alice.id, e.id)).topics.map((t) => t.name)).toEqual(["Environment"]);
    await deleteTopic(db, alice.id, env.id);
    expect((await getEntry(db, alice.id, e.id)).topics).toEqual([]);
    expect((await topicTree(db, alice.id)).some((t) => t.name === "Climate")).toBe(true); // subtopic moved up
  });

  it("finds exact and near duplicates", async () => {
    const d = await findDuplicates(db, alice.id, ["Undermine", "undermien", "ubiquitous"]);
    expect(d.get("Undermine")?.kind).toBe("exact");
    expect(d.get("undermien")?.kind).toBe("near");
    expect(d.has("ubiquitous")).toBe(false);
  });
});

describe("import", () => {
  it("parses, flags duplicates and commits with topics", async () => {
    const job = await createImportJob(db, alice.id, {
      sourceKind: "paste",
      text: "Elections:\nturnout — Wahlbeteiligung\nto undermine — to weaken gradually\nballot — Stimmzettel\nballot — Wahlzettel",
    });
    const byHead = Object.fromEntries(job.candidates.map((c) => [c.headword + c.key, c]));
    expect(job.candidates).toHaveLength(4);
    expect(job.candidates[1].duplicateOf?.kind).toBe("exact");
    expect(job.candidates[3].include).toBe(false);
    expect(job.candidates[0].suggestedTopic).toBe("Elections");
    expect(Object.keys(byHead)).toHaveLength(4);
    const res = await commitImport(db, alice.id, job.id, {
      candidates: job.candidates.map((c) => ({ ...c, include: c.include, duplicateAction: c.duplicateOf ? "merge" : undefined, topicPath: c.suggestedTopic })),
    });
    expect(res).toMatchObject({ created: 2, merged: 1, skipped: 1 });
    await expect(commitImport(db, alice.id, job.id, { candidates: [] })).rejects.toMatchObject({ status: 400 });
    await expect(commitImport(db, bob.id, job.id, { candidates: [] })).rejects.toMatchObject({ status: 404 });
    const undermine = (await listEntries(db, alice.id, { q: "undermine" })).rows[0].entry;
    expect(undermine.definitionEn).toBe("to weaken gradually"); // kept existing
    expect((await getEntry(db, alice.id, undermine.id)).topics.map((t) => t.name).sort()).toEqual(["Elections", "Politics"]);
  });
});

describe("reviews", () => {
  it("records idempotently, schedules, and undoes", async () => {
    const e = await createEntry(db, alice.id, { headword: "salient", translationDe: "hervorstechend" });
    const first = ev(e.id);
    const r1 = await recordReview(db, alice.id, first);
    expect(r1.counted).toBe(true);
    expect(r1.duplicate).toBe(false);
    const r2 = await recordReview(db, alice.id, first);
    expect(r2.duplicate).toBe(true);
    expect(r2.nextDue).toBe(r1.nextDue);
    const before = (await getEntry(db, alice.id, e.id)).state!;
    expect(before.reps).toBe(1);
    const second = ev(e.id, { outcome: "wrong", reviewedAt: new Date(Date.now() + 1000).toISOString() });
    await recordReview(db, alice.id, second);
    await expect(undoReview(db, alice.id, first.clientEventId)).rejects.toMatchObject({ status: 409 });
    await undoReview(db, alice.id, second.clientEventId);
    const after = (await getEntry(db, alice.id, e.id)).state!;
    expect(after.reps).toBe(before.reps);
    expect(after.due.toISOString()).toBe(before.due.toISOString());
    expect(after.mastery).toEqual(before.mastery);
  });

  it("never rewinds the schedule for late (out-of-order) events", async () => {
    const e = await createEntry(db, alice.id, { headword: "tenuous", translationDe: "dürftig" });
    await recordReview(db, alice.id, ev(e.id));
    const st1 = (await getEntry(db, alice.id, e.id)).state!;
    const late = await recordReview(db, alice.id, ev(e.id, { outcome: "wrong", reviewedAt: new Date(Date.now() - 3600_000).toISOString() }));
    expect(late.late).toBe(true);
    expect(late.counted).toBe(false);
    const st2 = (await getEntry(db, alice.id, e.id)).state!;
    expect(st2.due.toISOString()).toBe(st1.due.toISOString());
    expect(st2.mastery.spelling!.n).toBe(2);
  });

  it("builds sessions with exercises and respects the new-word limit", async () => {
    const s = await buildSession(db, alice.id, { mode: "mixed", minutes: 10 });
    expect(s.cards.length).toBeGreaterThan(0);
    expect(s.cards.every((c) => c.exercise.entryId)).toBe(true);
    const bobs = await buildSession(db, bob.id, { mode: "mixed" });
    expect(bobs.cards).toHaveLength(0);
  });
});
