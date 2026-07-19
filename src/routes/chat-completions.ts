import { randomUUID } from "node:crypto";
import { CursorAgentError, type RunResult } from "@cursor/sdk";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireCursorApiKey } from "../auth/cursor-api-key.js";
import { resolveMcpGatewayToken } from "../auth/mcp-gateway-token.js";
import { buildMcpGatewayServers } from "../mcp/gateway-config.js";
import {
  CompletionRunError,
  cursorAgentErrorStatus,
  runCompletion,
  streamCompletion,
} from "../cursor/completion.js";
import { buildChatCompletion, mapTokenUsage } from "../openai/completions-mapper.js";
import { openaiError } from "../openai/errors.js";
import { messagesToPrompt } from "../openai/messages-to-prompt.js";
import { buildChunk, buildUsageChunk, formatSseData, SSE_DONE } from "../openai/stream-sse.js";
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

  const mcpGatewayToken = resolveMcpGatewayToken(c);
  const mcpServers = mcpGatewayToken ? buildMcpGatewayServers(mcpGatewayToken) : undefined;

  if (body.stream) {
    const streamId = `chatcmpl-${randomUUID()}`;
    return stream(c, async (sseStream) => {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");

      try {
        const gen = streamCompletion({ apiKey, model, prompt, requestId, mcpServers });
        let first = true;

        let runResult: RunResult | undefined;

        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            runResult = value;
            break;
          }
          const text = value;
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

        if (body.stream_options?.include_usage === true) {
          const openAiUsage = mapTokenUsage(runResult?.usage);
          if (openAiUsage) {
            await sseStream.write(
              formatSseData(buildUsageChunk({ id: streamId, model, usage: openAiUsage })),
            );
          }
        }

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
      mcpServers,
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
