import type { SDKImage, SDKUserMessage } from "@cursor/sdk";
import type { ChatContentPart, ChatMessage, ResponseFormat } from "../types/openai.js";
import { buildJsonInstructionSuffix, isJsonResponseFormat } from "./json-response.js";
import { messagesToPrompt } from "./messages-to-prompt.js";

export type AgentInput =
  | { type: "string"; value: string }
  | { type: "userMessage"; value: SDKUserMessage };

const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.+)$/s;

function partText(part: ChatContentPart): string {
  if (part.type === "text") {
    return part.text;
  }
  return "";
}

function imageUrlFromPart(part: ChatContentPart): string | undefined {
  if (part.type === "image_url") {
    const raw = part.image_url;
    return typeof raw === "string" ? raw : raw.url;
  }
  if (part.type === "image") {
    if (part.url) return part.url;
    if (part.image_url?.url) return part.image_url.url;
  }
  return undefined;
}

function partToSdkImage(part: ChatContentPart): SDKImage | undefined {
  const url = imageUrlFromPart(part);
  if (url) {
    const dataMatch = DATA_URL_PATTERN.exec(url.trim());
    if (dataMatch) {
      return { data: dataMatch[2]!, mimeType: dataMatch[1]! };
    }
    return { url };
  }

  if (part.type === "image" && part.b64_json) {
    return { data: part.b64_json, mimeType: "image/jpeg" };
  }

  return undefined;
}

function collectImages(messages: ChatMessage[]): SDKImage[] {
  const images: SDKImage[] = [];

  for (const msg of messages) {
    if (msg.content === null || msg.content === undefined || typeof msg.content === "string") {
      continue;
    }
    for (const part of msg.content) {
      const image = partToSdkImage(part);
      if (image) {
        images.push(image);
      }
    }
  }

  return images;
}

export function agentInputHasUsableContent(input: AgentInput): boolean {
  if (input.type === "string") {
    return input.value.trim().length > 0;
  }
  const { text, images } = input.value;
  return text.trim().length > 0 || (images?.length ?? 0) > 0;
}

export function messagesToAgentInput(messages: ChatMessage[]): AgentInput {
  const text = messagesToPrompt(messages);
  const images = collectImages(messages);

  if (images.length === 0) {
    return { type: "string", value: text };
  }

  return {
    type: "userMessage",
    value: {
      text,
      images,
    },
  };
}

export function applyJsonInstructionsToAgentInput(
  input: AgentInput,
  responseFormat: ResponseFormat | undefined,
): AgentInput {
  if (!isJsonResponseFormat(responseFormat)) {
    return input;
  }
  return appendTextToAgentInput(input, buildJsonInstructionSuffix(responseFormat!));
}

export function appendTextToAgentInput(input: AgentInput, suffix: string): AgentInput {
  if (!suffix) return input;

  if (input.type === "string") {
    return { type: "string", value: input.value + suffix };
  }

  return {
    type: "userMessage",
    value: {
      ...input.value,
      text: input.value.text + suffix,
    },
  };
}

/** @internal exported for tests */
export function messageTextFromContent(content: ChatMessage["content"]): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  return content.map((part) => partText(part)).filter(Boolean).join("\n");
}
