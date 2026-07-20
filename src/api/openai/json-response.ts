import type { ResponseFormat } from "../types/openai.js";

export class JsonNormalizeError extends Error {
  readonly status = 502;

  constructor(message: string) {
    super(message);
    this.name = "JsonNormalizeError";
  }
}

export function isJsonResponseFormat(responseFormat: ResponseFormat | undefined): boolean {
  if (!responseFormat) return false;
  return responseFormat.type === "json_object" || responseFormat.type === "json_schema";
}

export function buildJsonInstructionSuffix(responseFormat: ResponseFormat): string {
  if (responseFormat.type === "json_object") {
    return "\n\nRespond with a single JSON object only. No markdown code fences, no explanation before or after the JSON.";
  }

  if (responseFormat.type !== "json_schema") {
    return "";
  }

  const schemaJson = JSON.stringify(responseFormat.json_schema.schema);
  return `\n\nRespond with a single JSON object only that conforms to this JSON Schema (best effort): ${schemaJson}. No markdown code fences, no explanation before or after the JSON.`;
}

export function appendJsonInstructions(
  text: string,
  responseFormat: ResponseFormat | undefined,
): string {
  if (!responseFormat || !isJsonResponseFormat(responseFormat)) {
    return text;
  }
  return text + buildJsonInstructionSuffix(responseFormat);
}

function stripMarkdownJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(trimmed);
  if (fenceMatch) {
    return fenceMatch[1]!.trim();
  }
  return trimmed;
}

function extractFirstJsonObject(raw: string): string | undefined {
  const start = raw.indexOf("{");
  if (start === -1) return undefined;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

export function normalizeJsonAssistantContent(raw: string): string {
  const stripped = stripMarkdownJsonFence(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const extracted = extractFirstJsonObject(stripped);
    if (!extracted) {
      throw new JsonNormalizeError("Model did not return valid JSON");
    }
    try {
      parsed = JSON.parse(extracted);
    } catch {
      throw new JsonNormalizeError("Model did not return valid JSON");
    }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JsonNormalizeError("Model JSON response must be a single object");
  }

  return JSON.stringify(parsed);
}

export function normalizeAssistantContentForResponse(
  raw: string,
  responseFormat: ResponseFormat | undefined,
): string {
  if (!isJsonResponseFormat(responseFormat)) {
    return raw;
  }
  return normalizeJsonAssistantContent(raw);
}
