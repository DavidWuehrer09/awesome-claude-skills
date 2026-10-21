import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { feedbackResponses, learningStates, writingSubmissions } from "@/db/schema";
import { WRITING_DIMENSIONS } from "@/server/ai/features";
import { AIError } from "@/server/ai/errors";
import { freshDb, twoUsers } from "./helpers";

// The real Claude API is never called in tests; anthropicStructured is replaced per test.
const structured = vi.fn();
vi.mock("@/server/ai/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/anthropic")>()),
  anthropicStructured: (...args: unknown[]) => structured(...args),
}));

const w = await import("@/server/repos/writing");
const { createEntry } = await import("@/server/repos/vocab");

let db: Db;
let close: () => Promise<void>;
let users: Awaited<ReturnType<typeof twoUsers>>;

beforeAll(async () => {
  ({ db, close } = await freshDb());
  users = await twoUsers(db);
});
afterAll(() => close());
afterEach(() => {
  vi.unstubAllEnvs();
  structured.mockReset();
});

const usage = { model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 };
const real = () => {
  vi.stubEnv("AI_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
};

type Annotation = { id: string; excerpt: string; category: string; priority: string; isError: boolean; explanation: string; suggestion: string; question: string | null };
/** A schema-valid assessment; annotations and vocabulary verdicts are supplied per test. */
const assessment = (annotations: Annotation[], targetUse: { word: string; status: string; comment: string }[] = []) => ({
  summary: "A clear paragraph with a few weak word choices.",
  rubricName: "Paragraph (practice rubric)",
  dimensions: WRITING_DIMENSIONS.map((key) => ({ key, level: "solid", assessment: "Adequate.", evidence: [], strengths: [], weaknesses: [], improvement: "" })),
  annotations,
  strengths: ["Clear topic sentence."],
  priorities: [{ rank: 1, focus: "Word choice", action: "Check the verbs you use." }],
  vocabulary: { targetUse, missedOpportunities: [], simplerBetter: [] },
  exercise: { skill: "word choice", instruction: "Replace vague verbs.", items: [] },
  estimate: null,
  errorPatterns: [],
});
const ann = (id: string, excerpt: string, over: Partial<Annotation> = {}): Annotation => ({
  id, excerpt, category: "vocabulary", priority: "vocabulary_misuse", isError: true, explanation: "Not the right word here.", suggestion: "a better word", question: null, ...over,
});

async function submitted(userId: string, body: string) {
  const d = await w.createDraft(db, userId, null, "Test draft");
  await w.saveDraft(db, userId, d.id, { body, baseVersion: 1 });
  return { draft: d, submission: await w.submitDraft(db, userId, d.id) };
}

const writingScore = async (userId: string, entryId: string) => {
  const [st] = await db.select().from(learningStates).where(and(eq(learningStates.userId, userId), eq(learningStates.entryId, entryId)));
  return st.mastery.writing;
};

describe("drafts and submissions", () => {
  it("autosaves with optimistic concurrency: a stale version gets 409 and the server copy", async () => {
    const d = await w.createDraft(db, users.alice.id, null, "Autosave");
    const saved = await w.saveDraft(db, users.alice.id, d.id, { body: "First words of my essay.", baseVersion: 1 });
    expect(saved.version).toBe(2);
    await expect(w.saveDraft(db, users.alice.id, d.id, { body: "From another device", baseVersion: 1 }))
      .rejects.toMatchObject({ status: 409, details: { server: { body: "First words of my essay.", version: 2 } } });
    await expect(w.saveDraft(db, users.bob.id, d.id, { body: "Not mine", baseVersion: 2 })).rejects.toMatchObject({ status: 404 });
  });

  it("freezes each submission as an immutable, numbered version", async () => {
    const { draft, submission: v1 } = await submitted(users.alice.id, "Version one of the text, short but complete.");
    await w.saveDraft(db, users.alice.id, draft.id, { body: "Version two of the text, now revised.", baseVersion: 2 });
    const v2 = await w.submitDraft(db, users.alice.id, draft.id);
    expect([v1.versionNo, v2.versionNo]).toEqual([1, 2]);
    const again = await w.getSubmission(db, users.alice.id, v1.id);
    expect(again.submission.body).toBe("Version one of the text, short but complete.");
    expect(again.versions.map((v) => v.versionNo)).toEqual([1, 2]);
    await expect(w.getSubmission(db, users.bob.id, v1.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("assessment", () => {
  it("labels demo output as demo and gives no vocabulary credit from it", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const e = await createEntry(db, users.alice.id, { headword: "to scrutinise" });
    const { submission } = await submitted(users.alice.id, "Voters should scrutinise what politicians promise, but it's hard.");
    const a = await w.assessSubmission(db, users.alice.id, submission.id, { wantEstimate: false });
    expect(a).toMatchObject({ status: "complete", isDemo: true, provider: "demo" });
    expect((a.result as { summary: string }).summary).toMatch(/Demo check only/);
    expect(await writingScore(users.alice.id, e.id)).toBeUndefined();
    const judged = await w.ownVocabularyJudged(db, users.alice.id, submission.body, null);
    expect(judged).toEqual([{ id: e.id, headword: "to scrutinise", status: null }]);
  });

  it("keeps the submission when the assessment fails, and can retry", async () => {
    real();
    const body = "Public transport should be free because it reduces traffic in cities.";
    const { submission } = await submitted(users.alice.id, body);
    structured.mockRejectedValue(new AIError("unavailable", "The AI service is temporarily unavailable."));
    await expect(w.assessSubmission(db, users.alice.id, submission.id, { wantEstimate: false })).rejects.toMatchObject({ code: "unavailable" });
    const failed = await w.getSubmission(db, users.alice.id, submission.id);
    expect(failed.assessment).toMatchObject({ status: "failed", error: "The AI service is temporarily unavailable." });
    expect(failed.submission.body).toBe(body);

    structured.mockReset();
    structured.mockResolvedValue({ data: assessment([]), usage });
    const done = await w.assessSubmission(db, users.alice.id, submission.id, { wantEstimate: false });
    expect(done).toMatchObject({ id: failed.assessment!.id, status: "complete", isDemo: false });
  });

  it("rejects feedback that quotes text which is not in the submission", async () => {
    real();
    const { submission } = await submitted(users.bob.id, "Schools ought to teach media literacy from an early age.");
    structured.mockResolvedValue({ data: assessment([ann("a1", "media literacy is overrated")]), usage });
    await expect(w.assessSubmission(db, users.bob.id, submission.id, { wantEstimate: false })).rejects.toMatchObject({ code: "invalid_output" });
    expect(structured).toHaveBeenCalledTimes(2);
    expect(structured.mock.calls[1][0].user).toMatch(/annotation excerpt not in text/);
    const after = await w.getSubmission(db, users.bob.id, submission.id);
    expect(after.assessment?.status).toBe("failed");
    expect(after.assessment?.result).toBeNull();
  });

  it("credits the learner's own words in the text, using the feedback's judgement where it mentions them", async () => {
    real();
    const used = await createEntry(db, users.bob.id, { headword: "to mitigate" });
    const misused = await createEntry(db, users.bob.id, { headword: "ubiquitous" });
    const absent = await createEntry(db, users.bob.id, { headword: "to undermine" });
    const body = "Cycle lanes mitigate congestion. However, the ubiquitous of cars in suburbs makes change slow.";
    const { submission } = await submitted(users.bob.id, body);
    structured.mockResolvedValue({ data: assessment([ann("a1", "the ubiquitous of cars", { suggestion: "the ubiquity of cars" })]), usage });
    await w.assessSubmission(db, users.bob.id, submission.id, { wantEstimate: false });

    expect(await writingScore(users.bob.id, used.id)).toMatchObject({ n: 1, score: 0.6 }); // used, not commented on
    expect(await writingScore(users.bob.id, misused.id)).toMatchObject({ n: 1, score: 0.1 }); // quoted in an error
    expect(await writingScore(users.bob.id, absent.id)).toBeUndefined();
    const s = await w.getSubmission(db, users.bob.id, submission.id);
    const judged = await w.ownVocabularyJudged(db, users.bob.id, body, s.assessment!.result as unknown as import("@/server/repos/writing").AssessData);
    expect(Object.fromEntries(judged.map((j) => [j.headword, j.status]))).toEqual({ "to mitigate": "used", ubiquitous: "incorrect" });
  });
});

describe("accepted suggestions", () => {
  it("apply to the latest draft only when the excerpt occurs exactly once, with version checks", async () => {
    real();
    const body = "Firstly, the plan is good. The costs are really big. Secondly, the plan is good for families.";
    const { draft, submission } = await submitted(users.alice.id, body);
    structured.mockResolvedValue({
      data: assessment([
        ann("a1", "really big", { category: "register", priority: "optional", isError: false, suggestion: "considerable" }),
        ann("a2", "the plan is good", { category: "clarity", priority: "optional", isError: false, suggestion: "the plan is sound" }),
      ]),
      usage,
    });
    const a = await w.assessSubmission(db, users.alice.id, submission.id, { wantEstimate: false });

    await expect(w.respondToFeedback(db, users.alice.id, a.id, { annotationId: "a1", action: "accepted", apply: { replacement: "considerable", draftVersion: 1 } }))
      .rejects.toMatchObject({ status: 409 });
    const ok = await w.respondToFeedback(db, users.alice.id, a.id, { annotationId: "a1", action: "accepted", apply: { replacement: "considerable", draftVersion: 2 } });
    expect(ok.applied).toMatchObject({ status: "applied", draft: { version: 3, body: "Firstly, the plan is good. The costs are considerable. Secondly, the plan is good for families." } });

    const twice = await w.respondToFeedback(db, users.alice.id, a.id, { annotationId: "a2", action: "accepted", apply: { replacement: "the plan is sound", draftVersion: 3 } });
    expect(twice.applied).toMatchObject({ status: "ambiguous" });
    expect((await w.getDraft(db, users.alice.id, draft.id)).draft).toMatchObject({ version: 3 });

    // The submitted version itself never changes, and every response is recorded (not the one refused with 409).
    const [frozen] = await db.select().from(writingSubmissions).where(eq(writingSubmissions.id, submission.id));
    expect(frozen.body).toBe(body);
    const responses = await db.select().from(feedbackResponses).where(eq(feedbackResponses.assessmentId, a.id));
    expect(responses.map((r) => [r.annotationId, r.action])).toEqual([["a1", "accepted"], ["a2", "accepted"]]);
    await expect(w.respondToFeedback(db, users.bob.id, a.id, { annotationId: "a1", action: "accepted", apply: { replacement: "x", draftVersion: 3 } }))
      .rejects.toMatchObject({ status: 404 });
  });
});
