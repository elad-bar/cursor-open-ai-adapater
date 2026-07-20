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

function logCompletion(meta: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", msg: "cursor_completion", ...meta }));
}

function handleRunResult(result: RunResult, model: string, requestId: string): {
  content: string;
  id: string;
  usage: RunResult["usage"];
} {
  logCompletion({
    request_id: requestId,
    model,
    run_id: result.id,
    status: result.status,
  });

  if (result.status === "error") {
    throw new CompletionRunError(
      result.error?.message ?? "Cursor agent run failed",
      result.id,
    );
  }

  return {
    id: result.id,
    content: result.result ?? "",
    usage: result.usage,
  };
}

export async function runCompletion(params: {
  apiKey: string;
  model: string;
  input: AgentInput;
  requestId: string;
  mcpServers?: AgentOptions["mcpServers"];
}): Promise<{ content: string; id: string; usage: RunResult["usage"] }> {
  const options = buildAgentOptions(params.apiKey, params.model, params.mcpServers);
  const payload = toSendPayload(params.input);

  logCompletion({
    request_id: params.requestId,
    model: params.model,
    mcp_attached: Boolean(params.mcpServers),
    phase: "run_start",
  });

  try {
    await using agent = await Agent.create(options);
    const run = await agent.send(payload);
    const result = await run.wait();
    return handleRunResult(result, params.model, params.requestId);
  } catch (err) {
    if (err instanceof CompletionRunError) {
      throw err;
    }
    if (err instanceof CursorAgentError) {
      logCompletion({
        request_id: params.requestId,
        model: params.model,
        error: err.message,
        retryable: err.isRetryable,
      });
      throw err;
    }
    throw err;
  }
}

export async function* streamCompletion(params: {
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

  logCompletion({
    request_id: params.requestId,
    model: params.model,
    run_id: run.id,
    agent_id: run.agentId,
    mcp_attached: Boolean(params.mcpServers),
    phase: "started",
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
    logCompletion({
      request_id: params.requestId,
      model: params.model,
      run_id: result.id,
      agent_id: run.agentId,
      status: result.status,
    });

    if (result.status === "error") {
      throw new CompletionRunError(
        result.error?.message ?? "Cursor agent run failed",
        result.id,
      );
    }

    return result;
  } catch (err) {
    if (err instanceof CursorAgentError) {
      logCompletion({
        request_id: params.requestId,
        model: params.model,
        error: err.message,
        retryable: err.isRetryable,
      });
    }
    throw err;
  }
}

export function cursorAgentErrorStatus(err: CursorAgentError): number {
  return err.isRetryable ? 503 : 502;
}

export { STREAM_IDLE_HEARTBEAT_CHAR };
