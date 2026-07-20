import type { ChatMessage } from "../types/openai.js";

/**
 * Resume a Cursor agent only on a new user turn (last message is `user`).
 * Upstream tool loops end with assistant/tool messages — those need a fresh agent + full prompt.
 */
export function shouldResumeAgentSession(
  messages: ChatMessage[],
  externalSessionId: string | undefined,
): boolean {
  if (!externalSessionId) return false;
  const last = messages[messages.length - 1];
  return last?.role === "user";
}
