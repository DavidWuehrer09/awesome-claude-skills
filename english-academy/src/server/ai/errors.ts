import { HttpError } from "../http";

export type AIErrorCode =
  | "refused" | "invalid_output" | "rate_limited" | "timeout" | "unavailable" | "auth" | "bad_request" | "disabled" | "quota" | "budget";

const STATUS: Record<AIErrorCode, number> = {
  refused: 422, invalid_output: 502, rate_limited: 429, timeout: 504, unavailable: 503, auth: 503, bad_request: 400, disabled: 503, quota: 429, budget: 503,
};

/** AI failures are HTTP errors with a user-facing message; the rest of the app keeps working. */
export class AIError extends HttpError {
  constructor(public code: AIErrorCode, message: string, details?: unknown) {
    super(STATUS[code], message, code, details);
    this.name = "AIError";
  }
}
