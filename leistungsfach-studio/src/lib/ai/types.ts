export const AI_OPERATIONS = [
  "assessment",
  "revision",
  "explanation",
  "learner_update",
  "exercise_generation",
  "exercise_evaluation",
  "progress_review",
  "vocab_check",
  "teacher_analysis",
] as const;
export type AIOperation = (typeof AI_OPERATIONS)[number];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ProviderRequest = {
  operation: AIOperation;
  /** Stable instructions (cached prefix). */
  system: string;
  /** Per-request context blocks (curriculum excerpt, learner data, task) — kept in the user turn. */
  messages: ChatTurn[];
  jsonSchema: Record<string, unknown>;
  effort: Effort;
  maxTokens: number;
  timeoutMs: number;
  /** Structured inputs the mock provider uses to produce realistic, valid output. Ignored by real providers. */
  mockContext?: unknown;
};

export type ProviderResponse = {
  text: string;
  stopReason: string | null;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export interface AIProvider {
  name: "anthropic" | "mock";
  model: string;
  generate(req: ProviderRequest): Promise<ProviderResponse>;
}

export type AIErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "api_error"
  | "auth_error"
  | "refusal"
  | "truncated"
  | "invalid_json"
  | "schema_invalid"
  | "semantic_invalid";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
    public validationErrors: string[] = [],
  ) {
    super(message);
  }
}

export const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  not_configured: "The AI tutor is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the app.",
  timeout: "The AI tutor took too long to respond. Your work is saved — please try again.",
  rate_limited: "The AI service is busy (rate limit). Wait a minute and try again.",
  api_error: "The AI service returned an error. Your work is saved — please try again.",
  auth_error: "The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.",
  refusal: "The AI service declined this request. Try rephrasing or removing unusual content.",
  truncated: "The AI response was cut off before it finished. Please try again.",
  invalid_json: "The AI response could not be read (malformed). Nothing was saved from it — please try again.",
  schema_invalid: "The AI response was incomplete or in the wrong format. Nothing was saved from it — please try again.",
  semantic_invalid: "The AI response failed quality checks (e.g. quoted text that is not in your essay). Nothing was saved from it — please try again.",
};
