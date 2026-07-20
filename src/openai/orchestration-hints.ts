import type { ChatMessage } from "../types/openai.js";

export function countToolMessages(messages: ChatMessage[]): number {
  return messages.filter((m) => m.role === "tool").length;
}

export function likelyDoubleOrchestration(
  messages: ChatMessage[],
  mcpAttached: boolean,
): boolean {
  return mcpAttached && countToolMessages(messages) > 0;
}
