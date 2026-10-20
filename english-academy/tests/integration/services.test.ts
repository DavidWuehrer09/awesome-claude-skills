import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiRequests, reminderDeliveries, userSettings } from "@/db/schema";
import { freshDb, twoUsers } from "./helpers";

// The real Claude API is never called in tests; anthropicStructured is replaced per test.
const structured = vi.fn();
vi.mock("@/server/ai/anthropic", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/anthropic")>()),
  anthropicStructured: (...args: unknown[]) => structured(...args),
}));

const { reminderDue, runReminderJob, verifyUnsubscribe, unsubscribeToken } = await import("@/server/notifications");
const { runFeature, aiStatus } = await import("@/server/ai/service");
const { loadSample } = await import("@/server/repos/account");

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
  vi.unstubAllGlobals();
  structured.mockReset();
});

const settings = { timezone: "Europe/Berlin", reminderTime: "17:30", reminderDays: [0, 1, 2, 3, 4, 5, 6], quietStart: "21:30", quietEnd: "07:30" };

describe("reminderDue", () => {
  it("waits for the local reminder time (Berlin, summer time)", () => {
    expect(reminderDue(new Date("2026-07-01T15:00:00Z"), settings)).toBe(false); // 17:00 local
    expect(reminderDue(new Date("2026-07-01T15:45:00Z"), settings)).toBe(true); // 17:45 local
  });
  it("respects quiet hours across midnight and unselected weekdays", () => {
    expect(reminderDue(new Date("2026-07-01T20:00:00Z"), settings)).toBe(false); // 22:00 local, quiet
    expect(reminderDue(new Date("2026-07-01T15:45:00Z"), { ...settings, reminderDays: [1, 2] })).toBe(false); // Wednesday
  });
  it("uses the user's own timezone", () => {
    // 17:45 in Berlin is 08:45 in Los Angeles: not yet due there.
    expect(reminderDue(new Date("2026-07-01T15:45:00Z"), { ...settings, timezone: "America/Los_Angeles" })).toBe(false);
  });
});

describe("reminder job", () => {
  it("sends one email per user and local day, even when the job runs twice", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
    vi.stubEnv("EMAIL_FROM", "Academy <reminders@example.com>");
    vi.stubEnv("APP_SECRET", "x".repeat(40));
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await loadSample(db, users.alice.id);
    await db.update(userSettings).set({ onboarded: true, emailEnabled: true, ...settings }).where(eq(userSettings.userId, users.alice.id));

    const now = new Date("2026-07-01T15:45:00Z");
    const first = await runReminderJob(db, now, "https://academy.example");
    const second = await runReminderJob(db, now, "https://academy.example");
    expect(first).toEqual([{ userId: users.alice.id, channel: "email", status: "sent" }]);
    expect(second).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.text).toContain("https://academy.example/api/email/unsubscribe?u=");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("retries a failed send on the next run, at most three attempts", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
    vi.stubEnv("EMAIL_FROM", "Academy <reminders@example.com>");
    vi.stubEnv("APP_SECRET", "x".repeat(40));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const now = new Date("2026-07-02T15:45:00Z");
    for (let i = 0; i < 4; i++) await runReminderJob(db, now);
    const [row] = await db.select().from(reminderDeliveries).where(eq(reminderDeliveries.localDate, "2026-07-02"));
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(3);
  });

  it("does nothing without email or push configuration", async () => {
    expect(await runReminderJob(db, new Date("2026-07-03T15:45:00Z"))).toEqual([]);
  });

  it("signs unsubscribe links per user", () => {
    vi.stubEnv("APP_SECRET", "y".repeat(40));
    const t = unsubscribeToken(users.alice.id);
    expect(verifyUnsubscribe(users.alice.id, t)).toBe(true);
    expect(verifyUnsubscribe(users.bob.id, t)).toBe(false);
    expect(verifyUnsubscribe(users.alice.id, "forged")).toBe(false);
  });
});

describe("AI service", () => {
  const input = { existingTopics: [], items: [{ key: "a", headword: "to mitigate", meaning: "abmildern" }, { key: "b", headword: "ballot", meaning: "Stimmzettel" }] };
  const usage = { model: "claude-opus-5-5", inputTokens: 100, outputTokens: 50 };

  it("labels demo output as demo and never calls the API", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    const r = await runFeature(db, users.bob.id, "classify", input);
    expect(r.meta.demo).toBe(true);
    expect(structured).not.toHaveBeenCalled();
    expect(aiStatus().demo).toBe(true);
  });

  it("refuses cleanly when no provider is configured", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(aiStatus()).toMatchObject({ available: false, misconfigured: true });
    await expect(runFeature(db, users.bob.id, "classify", input)).rejects.toMatchObject({ code: "disabled" });
  });

  it("re-asks once when the output fails a semantic check, then accepts a valid answer", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
    structured
      .mockResolvedValueOnce({ data: { groups: [{ topic: "Environment", subtopic: null, keys: ["a"] }] }, usage })
      .mockResolvedValueOnce({ data: { groups: [{ topic: "Environment", subtopic: null, keys: ["a"] }, { topic: "Politics", subtopic: null, keys: ["b"] }] }, usage });
    const r = await runFeature(db, users.bob.id, "classify", input);
    expect(r.meta).toMatchObject({ demo: false, provider: "anthropic" });
    expect(r.data.groups).toHaveLength(2);
    expect(structured.mock.calls[1][0].user).toContain("1 items were not assigned");
    const log = await db.select().from(aiRequests).where(eq(aiRequests.userId, users.bob.id));
    expect(log.map((l) => l.status)).toEqual(expect.arrayContaining(["invalid_output", "ok"]));
    expect(log.find((l) => l.status === "ok")?.estCostUsd).toBeCloseTo(0.0014);
  });

  it("rejects output that never validates instead of returning it", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
    structured.mockResolvedValue({ data: { groups: "not an array" }, usage });
    await expect(runFeature(db, users.bob.id, "classify", input)).rejects.toMatchObject({ code: "invalid_output" });
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it("enforces the per-user daily cap", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-placeholder");
    vi.stubEnv("AI_DAILY_REQUEST_LIMIT", "1");
    await expect(runFeature(db, users.bob.id, "classify", input)).rejects.toMatchObject({ code: "quota" });
    expect(structured).not.toHaveBeenCalled();
  });

  it("honours the user's AI opt-out", async () => {
    vi.stubEnv("AI_PROVIDER", "demo");
    await db.update(userSettings).set({ aiEnabled: false }).where(eq(userSettings.userId, users.alice.id));
    await expect(runFeature(db, users.alice.id, "classify", input)).rejects.toMatchObject({ code: "disabled" });
  });
});
