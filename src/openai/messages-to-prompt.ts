import type { ChatContentPart, ChatMessage } from "../types/openai.js";

function partText(part: ChatContentPart): string {
  if (part.type === "text") {
    return part.text;
  }
  return "";
}

function messageText(content: ChatMessage["content"]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => partText(part))
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
