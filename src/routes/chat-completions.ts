import { randomUUID } from "node:crypto";
import { CursorAgentError, type RunResult } from "@cursor/sdk";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireCursorApiKey } from "../auth/cursor-api-key.js";
import { resolveMcpGatewayToken } from "../auth/mcp-gateway-token.js";
import {
  CompletionRunError,
  STREAM_IDLE_HEARTBEAT_CHAR,
  cursorAgentErrorStatus,
  runCompletion,
  streamCompletion,
} from "../cursor/completion.js";
import { buildMcpGatewayServers } from "../mcp/gateway-config.js";
import { buildChatCompletion, mapTokenUsage } from "../openai/completions-mapper.js";
import { openaiError } from "../openai/errors.js";
import {
  JsonNormalizeError,
  isJsonResponseFormat,
  normalizeAssistantContentForResponse,
} from "../openai/json-response.js";
import {
  agentInputHasUsableContent,
  applyJsonInstructionsToAgentInput,
  messagesToAgentInput,
} from "../openai/messages-to-agent-input.js";
import { buildChunk, buildUsageChunk, formatSseData, SSE_DONE } from "../openai/stream-sse.js";
import type { ChatCompletionRequest } from "../types/openai.js";

export const chatCompletionsRoutes = new Hono();

function isHeartbeatChunk(text: string): boolean {
  return text === STREAM_IDLE_HEARTBEAT_CHAR;
}

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

  let agentInput = messagesToAgentInput(body.messages);
  agentInput = applyJsonInstructionsToAgentInput(agentInput, body.response_format);

  if (!agentInputHasUsableContent(agentInput)) {
    return c.json(openaiError("messages contain no usable content", "invalid_request_error"), 400);
  }

  const requestId = c.get("requestId");
  const model = body.model.trim();
  const jsonMode = isJsonResponseFormat(body.response_format);

  const mcpGatewayToken = resolveMcpGatewayToken(c);
  const mcpServers = mcpGatewayToken ? buildMcpGatewayServers(mcpGatewayToken) : undefined;

  if (body.stream) {
    const streamId = `chatcmpl-${randomUUID()}`;
    return stream(c, async (sseStream) => {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");

      try {
        const gen = streamCompletion({ apiKey, model, input: agentInput, requestId, mcpServers });
        let runResult: RunResult | undefined;
        let firstChunk = true;
        let streamedBuffer = "";

        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            runResult = value;
            break;
          }
          const text = value;
          if (jsonMode) {
            if (!isHeartbeatChunk(text)) {
              streamedBuffer += text;
            }
            continue;
          }

          await sseStream.write(
            formatSseData(
              buildChunk({
                id: streamId,
                model,
                ...(firstChunk ? { role: "assistant" as const, content: text } : { content: text }),
              }),
            ),
          );
          firstChunk = false;
        }

        if (jsonMode) {
          const raw = runResult?.result ?? streamedBuffer;
          const content = normalizeAssistantContentForResponse(raw, body.response_format);
          await sseStream.write(
            formatSseData(
              buildChunk({
                id: streamId,
                model,
                role: "assistant",
                content,
              }),
            ),
          );
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
          err instanceof JsonNormalizeError
            ? err.message
            : err instanceof CompletionRunError || err instanceof CursorAgentError
              ? err.message
              : "Internal server error";
        await sseStream.write(formatSseData(JSON.stringify(openaiError(message, "api_error"))));
        await sseStream.write(SSE_DONE);
      }
    });
  }

  try {
    const { content: rawContent, id, usage } = await runCompletion({
      apiKey,
      model,
      input: agentInput,
      requestId,
      mcpServers,
    });
    const content = normalizeAssistantContentForResponse(rawContent, body.response_format);
    return c.json(
      buildChatCompletion({
        id: id.startsWith("chatcmpl-") ? id : `chatcmpl-${id}`,
        model,
        content,
        usage,
      }),
    );
  } catch (err) {
    if (err instanceof JsonNormalizeError) {
      return c.json(openaiError(err.message, "api_error", "json_normalize_error"), err.status);
    }
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
