import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiRequests } from "@/db/schema";
import { log } from "../log";
import { rateLimit } from "../ratelimit";
import { getSettings } from "../repos/learning";
import type { ChatTurn } from "./anthropic";
import { aiConfig, estimateCost } from "./config";
import { AIError } from "./errors";
import { features, type FeatureId, type FeatureInput, type FeatureOutput } from "./features";
import { getProvider } from "./provider";
import { assertWithinLimits, categoryOf } from "./usage";

export { AIError };

export type AIResult<T> = { data: T; meta: { provider: string; model: string; promptVersion: string; demo: boolean } };

export function aiStatus() {
  const cfg = aiConfig();
  return {
    provider: cfg.provider,
    model: cfg.provider === "demo" ? "demo" : cfg.provider === "none" ? null : cfg.model,
    demo: cfg.provider === "demo",
    available: cfg.provider !== "none",
    misconfigured: cfg.misconfigured,
  };
}

async function guard(db: Db, userId: string, feature: string) {
  const cfg = aiConfig();
  const settings = await getSettings(db, userId);
  if (!settings.aiEnabled) throw new AIError("disabled", "AI features are turned off in your settings.");
  if (cfg.provider === "none") {
    throw new AIError("disabled", cfg.misconfigured ? "AI is not available: the server's AI provider is not configured correctly." : "AI features are not enabled on this site.");
  }
  await rateLimit(db, `ai:${userId}`, 20, 60, "You are sending AI requests very quickly. Please wait a moment.");
  if (cfg.provider !== "demo") {
    // Safety net against runaway loops, independent of the monthly plan allowance.
    const since = new Date(Date.now() - 86400000);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(aiRequests)
      .where(and(eq(aiRequests.userId, userId), gte(aiRequests.createdAt, since), sql`${aiRequests.provider} <> 'demo'`));
    if (n >= cfg.dailyRequestLimit) throw new AIError("quota", "Daily AI limit reached. It resets within 24 hours.");
    await assertWithinLimits(db, userId, feature);
  }
  return cfg;
}

async function record(db: Db, row: typeof aiRequests.$inferInsert) {
  try {
    await db.insert(aiRequests).values({ ...row, category: categoryOf(row.feature) });
  } catch (e) {
    log.warn("ai_log_failed", { error: e instanceof Error ? e.message : "unknown" });
  }
}

export async function runFeature<F extends FeatureId>(db: Db, userId: string, id: F, input: FeatureInput<F>): Promise<AIResult<FeatureOutput<F>>> {
  const cfg = await guard(db, userId, id);
  // Each feature object carries its own schema/prompt; typed loosely here to keep one code path.
  const f = features[id] as unknown as {
    id: string; version: string; schema: import("zod").ZodType; effort: "low" | "medium" | "high"; maxTokens: number; system: string;
    user: (i: unknown) => string; images?: (i: unknown) => never; pdf?: (i: unknown) => string | undefined;
    check?: (i: unknown, o: unknown) => string[]; demo: (i: unknown) => unknown; fast?: boolean;
  };
  if (cfg.provider === "demo") {
    try {
      const data = f.schema.parse(f.demo(input));
      await record(db, { userId, feature: f.id, provider: "demo", model: "demo", promptVersion: f.version, status: "ok" });
      return { data: data as FeatureOutput<F>, meta: { provider: "demo", model: "demo", promptVersion: f.version, demo: true } };
    } catch (e) {
      if (e instanceof Error && e.message === "demo_unsupported") {
        throw new AIError("disabled", "This feature needs a real AI provider (demo mode cannot do it).");
      }
      throw e;
    }
  }
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const { data, usage } = await getProvider(cfg.provider).structured({
        model: f.fast ? cfg.fastModel : cfg.model,
        system: f.system,
        user: f.user(input) + (lastProblems.length ? `\n\nYour previous answer had problems; fix them: ${lastProblems.join("; ")}` : ""),
        images: f.images?.(input),
        pdfBase64: f.pdf?.(input),
        schema: f.schema,
        effort: f.effort,
        maxTokens: f.maxTokens,
      });
      const validated = f.schema.parse(data);
      const problems = f.check?.(input, validated) ?? [];
      await record(db, {
        userId, feature: f.id, provider: cfg.provider, model: usage.model, promptVersion: f.version,
        status: problems.length ? "invalid_output" : "ok", latencyMs: Date.now() - started,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, estCostUsd: estimateCost(usage.model, usage.inputTokens, usage.outputTokens),
      });
      if (!problems.length) {
        return { data: validated as FeatureOutput<F>, meta: { provider: cfg.provider, model: usage.model, promptVersion: f.version, demo: false } };
      }
      lastProblems = problems.slice(0, 5);
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError("invalid_output", "The AI response could not be validated.");
      await record(db, {
        userId, feature: f.id, provider: cfg.provider, model: f.fast ? cfg.fastModel : cfg.model, promptVersion: f.version,
        status: err.code === "rate_limited" ? "rate_limited" : err.code === "refused" ? "refused" : "error",
        latencyMs: Date.now() - started, errorCode: err.code,
      });
      if (err.code !== "invalid_output" || attempt === 1) throw err;
      lastProblems = ["the output did not match the required schema"];
    }
  }
  throw new AIError("invalid_output", `The AI output failed validation (${lastProblems[0] ?? "unknown"}). Nothing was saved.`);
}

/** Streaming tutor reply. Returns an async iterator of text chunks plus metadata. */
export async function streamTutor(db: Db, userId: string, system: string, turns: ChatTurn[], demoReply: () => string) {
  const cfg = await guard(db, userId, "tutor");
  if (cfg.provider === "demo") {
    const text = demoReply();
    await record(db, { userId, feature: "tutor", provider: "demo", model: "demo", promptVersion: "tutor@1", status: "ok" });
    return {
      demo: true,
      async *chunks() {
        for (const part of text.match(/[\s\S]{1,40}(\s|$)/g) ?? [text]) yield part;
      },
    };
  }
  const started = Date.now();
  return {
    demo: false,
    async *chunks() {
      const gen = getProvider(cfg.provider).stream(system, turns, 4000);
      try {
        let r = await gen.next();
        while (!r.done) {
          yield r.value;
          r = await gen.next();
        }
        const usage = r.value;
        await record(db, {
          userId, feature: "tutor", provider: cfg.provider, model: usage.model, promptVersion: "tutor@1", status: "ok",
          latencyMs: Date.now() - started, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
          estCostUsd: estimateCost(usage.model, usage.inputTokens, usage.outputTokens),
        });
      } catch (e) {
        const err = e instanceof AIError ? e : new AIError("unavailable", "Tutor reply failed.");
        await record(db, { userId, feature: "tutor", provider: cfg.provider, model: cfg.model, promptVersion: "tutor@1", status: "error", errorCode: err.code, latencyMs: Date.now() - started });
        throw err;
      }
    },
  };
}
