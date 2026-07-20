import type { ChatMessage } from "../types/openai.js";

function messageText(content: ChatMessage["content"]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => part.text ?? "")
    .filter(Boolean)
    .join("\n");
}

const roleLabel: Record<string, string> = {
  system: "System",
  developer: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
};

export function messagesToPrompt(messages: ChatMessage[]): string {
  return messagesToInitialPrompt(messages);
}

export function messagesToInitialPrompt(messages: ChatMessage[]): string {
  const sections: string[] = [];

  for (const msg of messages) {
    const label = roleLabel[msg.role] ?? msg.role;
    const text = messageText(msg.content).trim();
    if (!text) continue;
    sections.push(`## ${label}\n\n${text}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return sections.join("\n\n---\n\n");
}

/** Last user message text for incremental turns on resumed agents. */
export function extractLatestUserTurn(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== "user") continue;
    const text = messageText(msg.content).trim();
    if (text) return text;
  }
  return "";
}
