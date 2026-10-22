import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AIError, type AIProvider, type ProviderRequest, type ProviderResponse } from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * Claude API provider. The API key is read from the server environment only.
 * - Structured outputs via output_config.format (JSON schema); the caller re-validates with Zod.
 * - Streaming + finalMessage() avoids HTTP timeouts on long assessments.
 * - Server-side refusal fallback ("default" routing) is enabled unless AI_FALLBACKS=off.
 */
export function createAnthropicProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AIError("not_configured", "ANTHROPIC_API_KEY is not set.");
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const useFallbacks = process.env.AI_FALLBACKS !== "off";
  const client = new Anthropic({ apiKey, maxRetries: 2 });

  return {
    name: "anthropic",
    model,
    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: req.maxTokens,
            system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
            output_config: { effort: req.effort, format: { type: "json_schema", schema: req.jsonSchema } },
            ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
          },
          { timeout: req.timeoutMs },
        );
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") throw new AIError("refusal", "The model declined the request.");
        if (msg.stop_reason === "max_tokens") throw new AIError("truncated", "Response hit the token limit.");
        const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        return {
          text,
          stopReason: msg.stop_reason ?? null,
          model: msg.model,
          inputTokens: msg.usage?.input_tokens,
          outputTokens: msg.usage?.output_tokens,
        };
      } catch (err) {
        if (err instanceof AIError) throw err;
        if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AIError("timeout", "Request timed out.");
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AIError("auth_error", "API key rejected.");
        if (err instanceof Anthropic.RateLimitError) throw new AIError("rate_limited", "Rate limited.");
        if (err instanceof Anthropic.APIError) throw new AIError("api_error", `API error ${err.status ?? ""}: ${err.message}`.slice(0, 500));
        throw new AIError("api_error", err instanceof Error ? err.message.slice(0, 500) : "Unknown error");
      }
    },
  };
}
