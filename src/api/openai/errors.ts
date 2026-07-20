import type { OpenAIErrorBody } from "../types/openai.js";

export function openaiError(
  message: string,
  type = "invalid_request_error",
  code?: string | null,
): OpenAIErrorBody {
  return {
    error: {
      message,
      type,
      param: null,
      code: code ?? null,
    },
  };
}
