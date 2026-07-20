import type { TokenUsage } from "@cursor/sdk";
import type { ChatCompletionResponse } from "../types/openai.js";

export function mapTokenUsage(
  usage: TokenUsage | undefined,
): ChatCompletionResponse["usage"] {
  if (!usage) return undefined;
  const prompt = usage.inputTokens ?? 0;
  const completion = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? prompt + completion;
  if (prompt === 0 && completion === 0 && total === 0) return undefined;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
  };
}

export function buildChatCompletion(params: {
  id: string;
  model: string;
  content: string;
  usage?: TokenUsage;
}): ChatCompletionResponse {
  return {
    id: params.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: params.content,
        },
        finish_reason: "stop",
      },
    ],
    usage: mapTokenUsage(params.usage),
  };
}
