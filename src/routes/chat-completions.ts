import { randomUUID } from "node:crypto";
import { CursorAgentError } from "@cursor/sdk";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireCursorApiKey } from "../auth/cursor-api-key.js";
import {
  CompletionRunError,
  cursorAgentErrorStatus,
  runCompletion,
  streamCompletion,
} from "../cursor/completion.js";
import { buildChatCompletion } from "../openai/completions-mapper.js";
import { openaiError } from "../openai/errors.js";
import { messagesToPrompt } from "../openai/messages-to-prompt.js";
import { buildChunk, formatSseData, SSE_DONE } from "../openai/stream-sse.js";
import type { ChatCompletionRequest } from "../types/openai.js";

export const chatCompletionsRoutes = new Hono();

chatCompletionsRoutes.post("/v1/chat/completions", async (c) => {
  const apiKey = requireCursorApiKey(c);
  if (apiKey instanceof Response) return apiKey;

  let body: ChatCompletionRequest;
  try {
    body = await c.req.json<ChatCompletionRequest>();
  } catch {
    return c.json(openaiError("Invalid JSON body", "invalid_request_error"), 400);
  }

  if (!body.model?.trim()) {
    return c.json(openaiError("model is required", "invalid_request_error", "missing_model"), 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json(
      openaiError("messages must be a non-empty array", "invalid_request_error", "missing_messages"),
      400,
    );
  }

  const prompt = messagesToPrompt(body.messages);
  if (!prompt.trim()) {
    return c.json(openaiError("messages contain no usable content", "invalid_request_error"), 400);
  }

  const requestId = c.get("requestId");
  const model = body.model.trim();

  if (body.stream) {
    const streamId = `chatcmpl-${randomUUID()}`;
    return stream(c, async (sseStream) => {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");

      try {
        const gen = streamCompletion({ apiKey, model, prompt, requestId });
        let first = true;

        for await (const text of gen) {
          await sseStream.write(
            formatSseData(
              buildChunk({
                id: streamId,
                model,
                ...(first ? { role: "assistant" as const, content: text } : { content: text }),
              }),
            ),
          );
          first = false;
        }

        await sseStream.write(
          formatSseData(buildChunk({ id: streamId, model, finishReason: "stop" })),
        );
        await sseStream.write(SSE_DONE);
      } catch (err) {
        const message =
          err instanceof CompletionRunError || err instanceof CursorAgentError
            ? err.message
            : "Internal server error";
        await sseStream.write(formatSseData(JSON.stringify(openaiError(message, "api_error"))));
        await sseStream.write(SSE_DONE);
      }
    });
  }

  try {
    const { content, id, usage } = await runCompletion({
      apiKey,
      model,
      prompt,
      requestId,
    });
    return c.json(
      buildChatCompletion({
        id: id.startsWith("chatcmpl-") ? id : `chatcmpl-${id}`,
        model,
        content,
        usage,
      }),
    );
  } catch (err) {
    if (err instanceof CompletionRunError) {
      return c.json(openaiError(err.message, "api_error", "agent_run_error"), err.status);
    }
    if (err instanceof CursorAgentError) {
      return c.json(
        openaiError(err.message, "api_error", err.code ?? null),
        cursorAgentErrorStatus(err) as 502,
      );
    }
    throw err;
  }
});
