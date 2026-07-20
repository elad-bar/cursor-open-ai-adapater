import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

function mimeFromPath(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

export async function buildUserMessage(
  prompt: string,
  imagePath?: string,
): Promise<ChatCompletionMessageParam> {
  if (!imagePath) {
    return { role: "user", content: prompt };
  }

  const data = await readFile(imagePath);
  const mime = mimeFromPath(imagePath);
  const url = `data:${mime};base64,${data.toString("base64")}`;

  return {
    role: "user",
    content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url } },
    ],
  };
}
