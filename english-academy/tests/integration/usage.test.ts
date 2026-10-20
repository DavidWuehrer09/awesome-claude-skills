import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiRequests, users } from "@/db/schema";
import { freshDb, twoUsers } from "./helpers";

const structured = vi.fn();
vi.mock("@/server/ai/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/anthropic")>()),
  anthropicStructured: (...args: unknown[]) => structured(...args),
}));

const { runFeature } = await import("@/server/ai/service");
const usage = await import("@/server/ai/usage");
const { rateLimit } = await import("@/server/ratelimit");
const { AIError } = await import("@/server/ai/errors");
const { errorResponse } = await import("@/server/http");

let db: Db;
let close: () => Promise<void>;
let u: Awaited<ReturnType<typeof twoUsers>>;

const input = { existingTopics: [], items: [{ key: "a", headword: "ballot", meaning: "Stimmzettel" }] };
const ok = { data: { groups: [{ topic: "Politics", subtopic: null, keys: ["a"] }] }, usage: { model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 500 } };
const real = () => {
  vi.stubEnv("AI_PROVIDER", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
};

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

describe("plan allowances", () => {
  it("counts successful real requests per category and stops at the plan limit", async () => {
    real();
    vi.stubEnv("AI_PLANS", JSON.stringify({ free: { label: "Free", monthly: { exercises: 2, exam_generation: 1, assessment: 1, tutor: 1, documents: 1 }, monthlyUsd: null } }));
    structured.mockResolvedValue(ok);
    await runFeature(db, u.alice.id, "classify", input);
    await runFeature(db, u.alice.id, "classify", input);
    const err = await runFeature(db, u.alice.id, "classify", input).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect(err).toMatchObject({ code: "quota", status: 429, details: { category: "exercises", used: 2, limit: 2 } });
    expect(err.message).toMatch(/2 vocabulary exercises/);
    expect(structured).toHaveBeenCalledTimes(2);
    const a = await usage.allowanceFor(db, u.alice.id);
    expect(a.categories.find((c) => c.category === "exercises")).toMatchObject({ used: 2, limit: 2 });
    // Another user is not affected.
    await expect(runFeature(db, u.bob.id, "classify", input)).resolves.toBeTruthy();
  });

  it("does not count demo output, which costs nothing", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    vi.stubEnv("AI_PLANS", JSON.stringify({ free: { label: "Free", monthly: { exercises: 0, exam_generation: 0, assessment: 0, tutor: 0, documents: 0 }, monthlyUsd: 0 } }));
    await expect(runFeature(db, u.alice.id, "classify", input)).resolves.toMatchObject({ meta: { demo: true } });
    expect((await usage.usageByCategory(db, u.alice.id)).exercises).toBe(0);
  });

  it("applies the plan an operator assigns", async () => {
    real();
    vi.stubEnv("AI_PLANS", JSON.stringify({
      free: { label: "Free", monthly: { exercises: 0, exam_generation: 0, assessment: 0, tutor: 0, documents: 0 }, monthlyUsd: null },
      plus: { label: "Plus", monthly: { exercises: 5, exam_generation: 0, assessment: 0, tutor: 0, documents: 0 }, monthlyUsd: null },
    }));
    structured.mockResolvedValue(ok);
    await expect(runFeature(db, u.bob.id, "classify", input)).rejects.toMatchObject({ code: "quota" });
    await usage.setUserPlan(db, u.bob.id, "plus");
    await expect(runFeature(db, u.bob.id, "classify", input)).resolves.toBeTruthy();
    await expect(usage.setUserPlan(db, u.bob.id, "gold")).rejects.toThrow(/Unknown plan/);
    await db.update(users).set({ plan: "free" }).where(eq(users.id, u.bob.id));
  });

  it("enforces a per-user monthly cost cap", async () => {
    real();
    vi.stubEnv("AI_PLANS", JSON.stringify({ free: { label: "Free", monthly: { exercises: null, exam_generation: null, assessment: null, tutor: null, documents: null }, monthlyUsd: 0.01 } }));
    structured.mockResolvedValue(ok); // 1000 in + 500 out at $4/$20 per MTok = $0.014
    await runFeature(db, u.alice.id, "classify", input);
    await expect(runFeature(db, u.alice.id, "classify", input)).rejects.toMatchObject({ code: "quota" });
  });
});

describe("global budgets", () => {
  it("pauses AI for everyone when the daily budget is spent, with a clear message", async () => {
    real();
    vi.stubEnv("AI_BUDGET_DAILY_USD", "0.50");
    await db.insert(aiRequests).values({ userId: u.bob.id, feature: "assess", category: "assessment", provider: "anthropic", model: "claude-opus-5-5", promptVersion: "x", status: "ok", estCostUsd: 0.6 });
    const err = await runFeature(db, u.alice.id, "classify", input).catch((e) => e);
    expect(err).toMatchObject({ code: "budget", status: 503 });
    expect(err.message).toMatch(/daily AI budget/);
    expect(structured).not.toHaveBeenCalled();
    const res = errorResponse(err);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("budget");
  });

  it("checks the monthly budget too, and failed requests count towards spend", async () => {
    real();
    vi.stubEnv("AI_BUDGET_MONTHLY_USD", "1");
    await db.insert(aiRequests).values({ userId: u.bob.id, feature: "examGenerate", category: "exam_generation", provider: "anthropic", model: "claude-opus-5-5", promptVersion: "x", status: "error", estCostUsd: 1.2 });
    await expect(runFeature(db, u.alice.id, "classify", input)).rejects.toMatchObject({ code: "budget" });
  });

  it("reports cost by feature, day and user for the operator", async () => {
    real();
    structured.mockResolvedValue(ok);
    await runFeature(db, u.alice.id, "classify", input);
    const r = await usage.costReport(db);
    expect(r.spend.monthUsd).toBeCloseTo(0.014);
    expect(r.byFeature[0]).toMatchObject({ feature: "classify", category: "exercises", requests: 1, inputTokens: 1000, outputTokens: 500 });
    expect(r.topUsers[0]).toMatchObject({ email: "alice@example.com", requests: 1 });
    expect(r.byDay).toHaveLength(1);
  });
});

describe("shared rate limiter", () => {
  it("counts in the database across calls and windows", async () => {
    await rateLimit(db, "test:key", 2, 60);
    await rateLimit(db, "test:key", 2, 60);
    await expect(rateLimit(db, "test:key", 2, 60)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    await expect(rateLimit(db, "test:other", 2, 60)).resolves.toBeUndefined();
  });
});
