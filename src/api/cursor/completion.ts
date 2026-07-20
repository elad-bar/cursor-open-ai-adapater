import {
  Agent,
  CursorAgentError,
  type AgentOptions,
  type RunResult,
  type SDKMessage,
  type SDKUserMessage,
  type TextBlock,
} from "@cursor/sdk";
import { getAgentWorkingDirectory, getEnv } from "../config/env.js";
import type { GatewayLogger } from "../logging.js";
import type { AgentInput } from "../openai/messages-to-agent-input.js";
import {
  STREAM_IDLE_HEARTBEAT_CHAR,
  withIdleHeartbeats,
} from "./stream-idle-heartbeat.js";

export class CompletionRunError extends Error {
  readonly status = 500;
  constructor(
    message: string,
    readonly runId?: string,
  ) {
    super(message);
    this.name = "CompletionRunError";
  }
}

function buildAgentOptions(
  apiKey: string,
  modelId: string,
  mcpServers?: AgentOptions["mcpServers"],
): AgentOptions {
  const model = { id: modelId };

  return {
    apiKey,
    model,
    ...(mcpServers ? { mcpServers } : {}),
    local: {
      cwd: getAgentWorkingDirectory(),
      settingSources: [],
    },
  };
}

function toSendPayload(input: AgentInput): string | SDKUserMessage {
  if (input.type === "string") {
    return input.value;
  }
  return input.value;
}

function assistantTextFromMessage(message: SDKMessage): string {
  if (message.type !== "assistant") return "";
  const parts: string[] = [];
  for (const block of message.message.content) {
    if ((block as TextBlock).type === "text") {
      parts.push((block as TextBlock).text);
    }
  }
  return parts.join("");
}

export class CursorCompletionService {
  constructor(private readonly logger: GatewayLogger) {}

  private handleRunResult(result: RunResult, requestId: string): {
    content: string;
    id: string;
    usage: RunResult["usage"];
  } {
    if (result.status === "error") {
      this.logger.error("completion_failed", {
        request_id: requestId,
        run_id: result.id,
        error: result.error?.message ?? "Cursor agent run failed",
      });
      throw new CompletionRunError(
        result.error?.message ?? "Cursor agent run failed",
        result.id,
      );
    }

    this.logger.info("completion_finished", {
      request_id: requestId,
      run_id: result.id,
    });

    return {
      id: result.id,
      content: result.result ?? "",
      usage: result.usage,
    };
  }

  async runCompletion(params: {
    apiKey: string;
    model: string;
    input: AgentInput;
    requestId: string;
    mcpServers?: AgentOptions["mcpServers"];
  }): Promise<{ content: string; id: string; usage: RunResult["usage"] }> {
    const options = buildAgentOptions(params.apiKey, params.model, params.mcpServers);
    const payload = toSendPayload(params.input);

    this.logger.info("completion_started", {
      request_id: params.requestId,
      mcp: Boolean(params.mcpServers),
    });

    try {
      await using agent = await Agent.create(options);
      const run = await agent.send(payload);
      const result = await run.wait();
      return this.handleRunResult(result, params.requestId);
    } catch (err) {
      if (err instanceof CompletionRunError) {
        throw err;
      }
      if (err instanceof CursorAgentError) {
        this.logger.error("completion_cursor_error", {
          request_id: params.requestId,
          error: err.message,
          retryable: err.isRetryable,
        });
        throw err;
      }
      throw err;
    }
  }

  async *streamCompletion(params: {
    apiKey: string;
    model: string;
    input: AgentInput;
    requestId: string;
    mcpServers?: AgentOptions["mcpServers"];
  }): AsyncGenerator<string, RunResult, void> {
    const options = buildAgentOptions(params.apiKey, params.model, params.mcpServers);
    const payload = toSendPayload(params.input);

    await using agent = await Agent.create(options);
    const run = await agent.send(payload);

    this.logger.info("completion_stream_started", {
      request_id: params.requestId,
      run_id: run.id,
    });

    try {
      const heartbeatSeconds = getEnv().streamIdleHeartbeatSeconds;
      const streamEvents = run.stream();

      const textChunks =
        heartbeatSeconds > 0
          ? withIdleHeartbeats(streamEvents, {
              intervalMs: heartbeatSeconds * 1000,
              onHeartbeat: () => STREAM_IDLE_HEARTBEAT_CHAR,
              onEvent: (message) => {
                const text = assistantTextFromMessage(message);
                return text || undefined;
              },
            })
          : (async function* () {
              for await (const message of streamEvents) {
                const text = assistantTextFromMessage(message);
                if (text) {
                  yield text;
                }
              }
            })();

      for await (const text of textChunks) {
        yield text;
      }

      const result = await run.wait();

      if (result.status === "error") {
        this.logger.error("completion_failed", {
          request_id: params.requestId,
          run_id: result.id,
          error: result.error?.message ?? "Cursor agent run failed",
        });
        throw new CompletionRunError(
          result.error?.message ?? "Cursor agent run failed",
          result.id,
        );
      }

      this.logger.info("completion_finished", {
        request_id: params.requestId,
        run_id: result.id,
      });

      return result;
    } catch (err) {
      if (err instanceof CursorAgentError) {
        this.logger.error("completion_cursor_error", {
          request_id: params.requestId,
          error: err.message,
          retryable: err.isRetryable,
        });
      }
      throw err;
    }
  }
}

export function cursorAgentErrorStatus(err: CursorAgentError): number {
  return err.isRetryable ? 503 : 502;
}

export { STREAM_IDLE_HEARTBEAT_CHAR };
