import type { ChatCompletionChunk } from "../types/openai.js";

export function formatSseData(payload: ChatCompletionChunk | string): string {
  if (typeof payload === "string") {
    return `data: ${payload}\n\n`;
  }
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function buildChunk(params: {
  id: string;
  model: string;
  content?: string;
  role?: "assistant";
  finishReason?: "stop" | null;
}): ChatCompletionChunk {
  return {
    id: params.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [
      {
        index: 0,
        delta: {
          ...(params.role ? { role: params.role } : {}),
          ...(params.content !== undefined ? { content: params.content } : {}),
        },
        finish_reason: params.finishReason ?? null,
      },
    ],
  };
}

export const SSE_DONE = "data: [DONE]\n\n";

export function buildUsageChunk(params: {
  id: string;
  model: string;
  usage: NonNullable<ChatCompletionChunk["usage"]>;
}): ChatCompletionChunk {
  return {
    id: params.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: params.model,
    choices: [],
    usage: params.usage,
  };
}
