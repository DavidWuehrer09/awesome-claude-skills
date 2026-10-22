import "server-only";
import type { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicProvider, DEFAULT_MODEL } from "./anthropic";
import { createMockProvider } from "./mock";
import { AIError, type AIOperation, type AIProvider, type ChatTurn, type Effort } from "./types";
import { getDb, schema } from "@/server/db/client";
import { log } from "@/server/log";

export function providerName(): "anthropic" | "mock" {
  return process.env.AI_PROVIDER === "mock" ? "mock" : "anthropic";
}

export function aiStatus() {
  const name = providerName();
  return {
    provider: name,
    configured: name === "mock" || Boolean(process.env.ANTHROPIC_API_KEY),
    model: name === "mock" ? "mock" : process.env.CLAUDE_MODEL || DEFAULT_MODEL,
  };
}

let cached: AIProvider | null = null;
let cachedFor = "";
function getProvider(): AIProvider {
  const key = `${providerName()}|${process.env.CLAUDE_MODEL ?? ""}|${process.env.ANTHROPIC_API_KEY ? "k" : ""}`;
  if (!cached || cachedFor !== key) {
    cached = providerName() === "mock" ? createMockProvider() : createAnthropicProvider();
    cachedFor = key;
  }
  return cached;
}

export type RunAIOptions<T> = {
  operation: AIOperation;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Extra checks beyond the schema (e.g. quotes must exist in the essay). Return a list of problems. */
  validate?: (data: T) => string[];
  effort?: Effort;
  maxTokens?: number;
  relatedId?: string;
  mockContext?: unknown;
};

export type RunAIResult<T> = { data: T; provider: string; model: string; attempts: number };

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

/**
 * The single entry point for AI calls: provider call → JSON parse → Zod validation → semantic validation.
 * On a validation failure, makes one repair attempt that shows the model its errors (append-only conversation).
 * Every call is logged to ai_runs. Throws AIError; never returns unvalidated data.
 */
export async function runAI<T>(opts: RunAIOptions<T>): Promise<RunAIResult<T>> {
  const started = Date.now();
  const maxAttempts = 2;
  const messages: ChatTurn[] = [{ role: "user", content: opts.user }];
  let provider: AIProvider | null = null;
  let lastError: AIError | null = null;
  let attempts = 0;
  let tokensIn = 0, tokensOut = 0;
  let model = "";

  try {
    provider = getProvider();
    model = provider.model;
    const jsonSchema = zodOutputFormat(opts.schema).schema as Record<string, unknown>;
    for (attempts = 1; attempts <= maxAttempts; attempts++) {
      const res = await provider.generate({
        operation: opts.operation,
        system: opts.system,
        messages,
        jsonSchema,
        effort: opts.effort ?? "medium",
        maxTokens: opts.maxTokens ?? 16000,
        timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 240000),
        mockContext: opts.mockContext,
      });
      model = res.model;
      tokensIn += res.inputTokens ?? 0;
      tokensOut += res.outputTokens ?? 0;

      let problems: string[] = [];
      let code: AIError["code"] = "schema_invalid";
      let parsed: unknown;
      try {
        parsed = parseJson(res.text);
      } catch {
        code = "invalid_json";
        problems = ["The response was not valid JSON."];
      }
      if (!problems.length) {
        const result = opts.schema.safeParse(parsed);
        if (!result.success) {
          problems = result.error.issues.slice(0, 15).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        } else {
          const semantic = opts.validate ? opts.validate(result.data) : [];
          if (!semantic.length) {
            await logRun(opts, "ok", provider.name, model, started, attempts, tokensIn, tokensOut);
            return { data: result.data, provider: provider.name, model, attempts };
          }
          code = "semantic_invalid";
          problems = semantic.slice(0, 15);
        }
      }
      lastError = new AIError(code, `Validation failed (${code}).`, problems);
      log.warn("ai.validation_failed", { operation: opts.operation, attempt: attempts, code, problems: problems.slice(0, 5) });
      if (attempts < maxAttempts) {
        messages.push({ role: "assistant", content: res.text || "(empty)" });
        messages.push({
          role: "user",
          content:
            "Your previous response failed validation:\n- " + problems.join("\n- ") +
            "\nReturn the complete corrected JSON object. Quote only text that appears verbatim in the provided material. Do not invent anything to satisfy the checks; remove an item instead.",
        });
      }
    }
    throw lastError ?? new AIError("schema_invalid", "Validation failed.");
  } catch (err) {
    const e = err instanceof AIError ? err : new AIError("api_error", err instanceof Error ? err.message : String(err));
    await logRun(opts, "error", provider?.name ?? providerName(), model, started, Math.min(attempts, maxAttempts), tokensIn, tokensOut, e);
    throw e;
  }
}

async function logRun<T>(
  opts: RunAIOptions<T>, status: "ok" | "error", provider: string, model: string, started: number,
  attempts: number, tokensIn: number, tokensOut: number, err?: AIError,
) {
  try {
    const db = await getDb();
    await db.insert(schema.aiRuns).values({
      operation: opts.operation, status, provider, model: model || null,
      errorCode: err?.code ?? null, errorMessage: err?.message?.slice(0, 1000) ?? null,
      validationErrors: err?.validationErrors?.length ? err.validationErrors : null,
      durationMs: Date.now() - started, inputTokens: tokensIn || null, outputTokens: tokensOut || null,
      attempts: Math.max(1, attempts), relatedId: opts.relatedId ?? null,
    });
  } catch (logErr) {
    log.error("ai.log_failed", { error: String(logErr) });
  }
  log.info("ai.run", { operation: opts.operation, status, provider, model, ms: Date.now() - started, attempts, code: err?.code });
}
