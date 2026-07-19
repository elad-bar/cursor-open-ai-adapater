import type { Context } from "hono";
import { getEnv } from "../config/env.js";
import { openaiError } from "../openai/errors.js";

export function resolveCursorApiKey(c: Context): string | null {
  const auth = c.req.header("Authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return getEnv().cursorApiKeyFallback ?? null;
}

export function requireCursorApiKey(c: Context): string | Response {
  const key = resolveCursorApiKey(c);
  if (!key) {
    return c.json(
      openaiError(
        "Missing Cursor API key. Set Authorization: Bearer <cursor_api_key> (same value as OpenAI API key on your provider).",
        "invalid_request_error",
        "missing_api_key",
      ),
      401,
    );
  }
  return key;
}
