import { randomUUID } from "node:crypto";
import { CursorAgentError } from "@cursor/sdk";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { requireCursorApiKey } from "../auth/cursor-api-key.js";
import { resolveMcpGatewayToken } from "../auth/mcp-gateway-token.js";
import {
  applyCompletionDiagnosticHeaders,
  CompletionRunError,
  cursorAgentErrorStatus,
  runCompletion,
  streamCompletion,
} from "../cursor/completion.js";
import { buildMcpGatewayServers } from "../mcp/gateway-config.js";
import { buildChatCompletion, mapTokenUsage } from "../openai/completions-mapper.js";
import { openaiError } from "../openai/errors.js";
import { messagesToInitialPrompt } from "../openai/messages-to-prompt.js";
import { buildChunk, buildUsageChunk, formatSseData, SSE_DONE } from "../openai/stream-sse.js";
import { resolveExternalSessionId } from "../session/resolve-external-session-id.js";
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

  const initialPrompt = messagesToInitialPrompt(body.messages);
  if (!initialPrompt.trim()) {
    return c.json(openaiError("messages contain no usable content", "invalid_request_error"), 400);
  }

  const requestId = c.get("requestId");
  const model = body.model.trim();
  const externalSessionId = resolveExternalSessionId(c, body.user);
  const signal = c.req.raw.signal;

  const mcpGatewayToken = resolveMcpGatewayToken(c);
  const mcpServers = mcpGatewayToken ? buildMcpGatewayServers(mcpGatewayToken) : undefined;

  const completionParams = {
    apiKey,
    model,
    messages: body.messages,
    requestId,
    mcpServers,
    externalSessionId,
    signal,
  };

  if (body.stream) {
    const streamId = `chatcmpl-${randomUUID()}`;
    return stream(c, async (sseStream) => {
      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");

      try {
        const gen = streamCompletion(completionParams);
        let first = true;
        let doneValue: Awaited<ReturnType<typeof gen.next>> | undefined;

        while (true) {
          const step = await gen.next();
          if (step.done) {
            doneValue = step;
            break;
          }
          const text = step.value;
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

        const streamDone = doneValue?.value;
        if (streamDone) {
          applyCompletionDiagnosticHeaders((name, value) => {
            c.header(name, value);
          }, streamDone.meta);
        }

        await sseStream.write(
          formatSseData(buildChunk({ id: streamId, model, finishReason: "stop" })),
        );

        const runResult = streamDone?.runResult;
        const includeUsage =
          body.stream_options?.include_usage === true || runResult?.usage !== undefined;
        if (includeUsage) {
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
        if (!(err instanceof CompletionRunError) && !(err instanceof CursorAgentError)) {
          console.error(
            JSON.stringify({
              level: "error",
              msg: "stream_completion_failed",
              request_id: requestId,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        await sseStream.write(formatSseData(JSON.stringify(openaiError(message, "api_error"))));
        await sseStream.write(SSE_DONE);
      }
    });
  }

  try {
    const { content, id, usage, meta } = await runCompletion(completionParams);
    applyCompletionDiagnosticHeaders((name, value) => {
      c.header(name, value);
    }, meta);
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
