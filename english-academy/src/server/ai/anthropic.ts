import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { aiConfig, FALLBACK_MODELS } from "./config";
import { AIError } from "./errors";

export { AIError } from "./errors";

let client: Anthropic | null = null;
function getClient() {
  const cfg = aiConfig();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: cfg.timeoutMs, maxRetries: cfg.maxRetries });
  return client;
}

export type ImageInput = { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string };

export type StructuredRequest<T extends z.ZodType> = {
  system: string;
  user: string;
  images?: ImageInput[];
  pdfBase64?: string;
  schema: T;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  model?: string;
};

export type Usage = { inputTokens: number; outputTokens: number; model: string };

function fallbackParams(model: string) {
  const cfg = aiConfig();
  return cfg.fallbacks && FALLBACK_MODELS.has(model)
    ? { betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[], fallbacks: "default" as const }
    : {};
}

export function mapError(e: unknown): AIError {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AIError("auth", "The AI provider rejected the API key. Check ANTHROPIC_API_KEY.");
  }
  if (e instanceof Anthropic.RateLimitError) return new AIError("rate_limited", "The AI provider is busy (rate limit). Try again shortly.");
  if (e instanceof Anthropic.BadRequestError) return new AIError("bad_request", "The AI request was rejected. Try shorter input.");
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError("timeout", "The AI provider took too long to respond.");
  if (e instanceof Anthropic.APIError) return new AIError("unavailable", "The AI provider is temporarily unavailable.");
  return new AIError("unavailable", "The AI request failed.");
}

export async function anthropicStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<{ data: z.infer<T>; usage: Usage }> {
  const model = req.model ?? aiConfig().model;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of req.images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  if (req.pdfBase64) {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: req.pdfBase64 } });
  }
  content.push({ type: "text", text: req.user });
  try {
    const res = await getClient().beta.messages.parse({
      model,
      max_tokens: Math.min(req.maxTokens, aiConfig().maxOutputTokens),
      system: req.system,
      messages: [{ role: "user", content }],
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
      ...fallbackParams(model),
    });
    if (res.stop_reason === "refusal") throw new AIError("refused", "The AI declined this request.");
    if (res.stop_reason === "max_tokens") throw new AIError("invalid_output", "The AI response was cut off.");
    if (res.parsed_output == null) throw new AIError("invalid_output", "The AI response did not match the expected format.");
    return {
      data: res.parsed_output as z.infer<T>,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: res.model },
    };
  } catch (e) {
    throw mapError(e);
  }
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Stream tutor text. Yields text deltas; resolves usage at the end. */
export async function* anthropicStream(system: string, turns: ChatTurn[], maxTokens: number, model?: string): AsyncGenerator<string, Usage> {
  const m = model ?? aiConfig().model;
  let stream;
  try {
    stream = getClient().beta.messages.stream({
      model: m,
      max_tokens: Math.min(maxTokens, aiConfig().maxOutputTokens),
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
      output_config: { effort: "low" },
      ...fallbackParams(m),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new AIError("refused", "The AI declined this request.");
    return { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens, model: final.model };
  } catch (e) {
    throw mapError(e);
  }
}
