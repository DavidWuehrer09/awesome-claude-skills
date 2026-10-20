import "server-only";
import type { z } from "zod";
import { anthropicStream, anthropicStructured, type ChatTurn, type StructuredRequest, type Usage } from "./anthropic";

/**
 * The only surface the app uses to talk to a model provider. Features, prompts,
 * validation, allowances and logging are provider-independent; adding a
 * provider means one adapter implementing this interface plus an entry in
 * PROVIDERS and PROVIDER_KEYS (config.ts). No feature code changes.
 */
export interface AIProvider {
  id: string;
  structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<{ data: z.infer<T>; usage: Usage }>;
  stream(system: string, turns: ChatTurn[], maxTokens: number, model?: string): AsyncGenerator<string, Usage>;
}

const PROVIDERS: Record<string, () => AIProvider> = {
  // Claude API (server-side key from the Claude Console; billed per token).
  anthropic: () => ({ id: "anthropic", structured: (req) => anthropicStructured(req), stream: (s, t, m, model) => anthropicStream(s, t, m, model) }),
};

export function getProvider(id: string): AIProvider {
  const make = PROVIDERS[id];
  if (!make) throw new Error(`Unknown AI provider ${id}`);
  return make();
}

export const KNOWN_PROVIDERS = Object.keys(PROVIDERS);
