import "server-only";

export type ProviderId = string; // "demo", "none" or a key of PROVIDERS in provider.ts

/** Environment variable holding each real provider's API key (server-side only). */
export const PROVIDER_KEYS: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY" };

/**
 * AI configuration (server-side only; never exposed to the browser).
 *
 * AI_PROVIDER=anthropic  needs ANTHROPIC_API_KEY (from the Claude Console).
 * AI_PROVIDER=demo       deterministic, clearly labelled demo output for
 *                        development; never presented as a real assessment.
 * AI_PROVIDER=none       AI features are disabled; everything else works.
 */
export function aiConfig() {
  const requested = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "demo");
  const keyVar = PROVIDER_KEYS[requested];
  const missingKey = !!keyVar && !process.env[keyVar];
  const provider: ProviderId = requested === "demo" || requested === "none" ? requested : keyVar && !missingKey ? requested : "none";
  return {
    provider,
    misconfigured: missingKey || (!keyVar && requested !== "demo" && requested !== "none"),
    model: process.env.AI_MODEL || "claude-opus-5-5",
    fastModel: process.env.AI_FAST_MODEL || process.env.AI_MODEL || "claude-opus-5-5",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 120_000),
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
    dailyRequestLimit: Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 300),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 16000),
    fallbacks: process.env.AI_FALLBACKS !== "off",
  };
}

/** USD per million tokens (input, output) for cost metadata; unknown models report null. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

/**
 * Estimated cost from list prices (no caching or batch discounts; the provider's
 * invoice is authoritative). AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK
 * override the table, e.g. for a model or provider not listed here.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const override = [Number(process.env.AI_PRICE_INPUT_PER_MTOK), Number(process.env.AI_PRICE_OUTPUT_PER_MTOK)];
  const p: [number, number] | undefined = override.every((x) => x > 0) ? (override as [number, number]) : PRICES[model];
  if (!p) return null;
  return Math.round(((inputTokens * p[0] + outputTokens * p[1]) / 1_000_000) * 10000) / 10000;
}

/** Models that accept server-side refusal fallbacks in "default" mode on the Claude API. */
export const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);
