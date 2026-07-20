import {
  Agent,
  AgentNotFoundError,
  CursorAgentError,
  type AgentOptions,
  type Run,
  type RunResult,
  type SDKAgent,
  type SDKMessage,
  type TextBlock,
} from "@cursor/sdk";
import type { ChatMessage } from "../types/openai.js";
import { getAgentWorkingDirectory, getEnv } from "../config/env.js";
import {
  extractLatestUserTurn,
  messagesToInitialPrompt,
} from "../openai/messages-to-prompt.js";
import { likelyDoubleOrchestration } from "../openai/orchestration-hints.js";
import {
  acquireExternalSessionLock,
  deleteAgentSession,
  getAgentSession,
  setAgentSession,
  withExternalSessionLock,
} from "../session/agent-session-store.js";
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

export interface CompletionMeta {
  sessionResumed: boolean;
  mcpAttached: boolean;
  likelyDoubleOrchestration: boolean;
  externalSessionId?: string;
}

export interface CompletionParams {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  requestId: string;
  mcpServers?: AgentOptions["mcpServers"];
  externalSessionId?: string;
  signal?: AbortSignal;
}

export interface CompletionBlockResult {
  content: string;
  id: string;
  usage: RunResult["usage"];
  meta: CompletionMeta;
}

export interface StreamCompletionDone {
  runResult: RunResult;
  meta: CompletionMeta;
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

function buildMeta(params: CompletionParams, sessionResumed: boolean): CompletionMeta {
  const mcpAttached = Boolean(params.mcpServers);
  return {
    sessionResumed,
    mcpAttached,
    likelyDoubleOrchestration: likelyDoubleOrchestration(params.messages, mcpAttached),
    externalSessionId: params.externalSessionId,
  };
}

function logCompletion(meta: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", msg: "cursor_completion", ...meta }));
}

function logRunStart(params: CompletionParams, phase: string): void {
  logCompletion({
    request_id: params.requestId,
    model: params.model,
    mcp_attached: Boolean(params.mcpServers),
    external_session_id: params.externalSessionId,
    likely_double_orchestration: likelyDoubleOrchestration(
      params.messages,
      Boolean(params.mcpServers),
    ),
    tool_message_count: params.messages.filter((m) => m.role === "tool").length,
    phase,
  });
}

function resolvePrompt(messages: ChatMessage[], sessionResumed: boolean): string {
  if (sessionResumed) {
    const incremental = extractLatestUserTurn(messages);
    if (incremental) return incremental;
  }
  return messagesToInitialPrompt(messages);
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

async function cancelRunIfAborted(run: Run, signal: AbortSignal | undefined): Promise<void> {
  if (!signal?.aborted) return;
  if (run.supports("cancel")) {
    await run.cancel();
  }
}

interface OpenedAgent {
  agent: SDKAgent;
  prompt: string;
  sessionResumed: boolean;
}

async function openAgentForCompletion(params: CompletionParams): Promise<OpenedAgent> {
  const { apiKey, model, externalSessionId, mcpServers, requestId } = params;
  const options = buildAgentOptions(apiKey, model, mcpServers);

  const existing =
    externalSessionId !== undefined
      ? getAgentSession(apiKey, externalSessionId, model)
      : undefined;

  if (existing) {
    try {
      const agent = await Agent.resume(existing.agentId, options);
      const prompt = resolvePrompt(params.messages, true);
      if (!prompt.trim()) {
        await agent[Symbol.asyncDispose]();
        throw new CompletionRunError("messages contain no usable content for resume turn");
      }
      logCompletion({
        request_id: requestId,
        model,
        agent_id: existing.agentId,
        external_session_id: externalSessionId,
        session_resumed: true,
        mcp_attached: Boolean(mcpServers),
        phase: "resume_start",
      });
      return { agent, prompt, sessionResumed: true };
    } catch (err) {
      if (!(err instanceof AgentNotFoundError)) {
        throw err;
      }
      deleteAgentSession(apiKey, externalSessionId!);
    }
  }

  const agent = await Agent.create(options);
  const prompt = resolvePrompt(params.messages, false);
  if (!prompt.trim()) {
    await agent[Symbol.asyncDispose]();
    throw new CompletionRunError("messages contain no usable content");
  }
  logCompletion({
    request_id: requestId,
    model,
    external_session_id: externalSessionId,
    session_resumed: false,
    mcp_attached: Boolean(mcpServers),
    phase: "create_start",
  });
  return { agent, prompt, sessionResumed: false };
}

function persistSession(
  params: CompletionParams,
  agentId: string,
  sessionResumed: boolean,
): void {
  const { apiKey, model, externalSessionId } = params;
  if (!externalSessionId) return;
  setAgentSession(apiKey, externalSessionId, model, agentId);
  if (!sessionResumed) {
    logCompletion({
      request_id: params.requestId,
      model,
      agent_id: agentId,
      external_session_id: externalSessionId,
      session_stored: true,
    });
  }
}

async function disposeAgent(agent: SDKAgent): Promise<void> {
  await agent[Symbol.asyncDispose]();
}

export async function runCompletion(params: CompletionParams): Promise<CompletionBlockResult> {
  logRunStart(params, "run_start");

  try {
    return await withExternalSessionLock(params.apiKey, params.externalSessionId, async () => {
      const { agent, prompt, sessionResumed } = await openAgentForCompletion(params);
      try {
        const run = await agent.send(prompt);
        if (params.signal) {
          params.signal.addEventListener(
            "abort",
            () => {
              void cancelRunIfAborted(run, params.signal);
            },
            { once: true },
          );
        }
        const result = await run.wait();
        const handled = handleRunResult(result, params.model, params.requestId);
        persistSession(params, run.agentId, sessionResumed);
        return {
          ...handled,
          meta: buildMeta(params, sessionResumed),
        };
      } finally {
        await disposeAgent(agent);
      }
    });
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

export async function* streamCompletion(
  params: CompletionParams,
): AsyncGenerator<string, StreamCompletionDone, void> {
  logRunStart(params, "stream_start");

  const releaseLock = await acquireExternalSessionLock(params.apiKey, params.externalSessionId);
  let agent: SDKAgent | undefined;
  let sessionResumed = false;
  let run: Run | undefined;

  try {
    const opened = await openAgentForCompletion(params);
    agent = opened.agent;
    sessionResumed = opened.sessionResumed;
    run = await agent.send(opened.prompt);

    logCompletion({
      request_id: params.requestId,
      model: params.model,
      run_id: run.id,
      agent_id: run.agentId,
      external_session_id: params.externalSessionId,
      session_resumed: sessionResumed,
      mcp_attached: Boolean(params.mcpServers),
      phase: "started",
    });

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
      if (params.signal?.aborted) {
        await cancelRunIfAborted(run, params.signal);
        throw new CompletionRunError("Client disconnected", run.id);
      }
      yield text;
    }

    const result = await run.wait();
    logCompletion({
      request_id: params.requestId,
      model: params.model,
      run_id: result.id,
      agent_id: run.agentId,
      external_session_id: params.externalSessionId,
      session_resumed: sessionResumed,
      status: result.status,
    });

    if (result.status === "error") {
      throw new CompletionRunError(
        result.error?.message ?? "Cursor agent run failed",
        result.id,
      );
    }

    persistSession(params, run.agentId, sessionResumed);

    return {
      runResult: result,
      meta: buildMeta(params, sessionResumed),
    };
  } catch (err) {
    if (run && params.signal?.aborted) {
      await cancelRunIfAborted(run, params.signal);
    }
    if (err instanceof CursorAgentError) {
      logCompletion({
        request_id: params.requestId,
        model: params.model,
        error: err.message,
        retryable: err.isRetryable,
      });
    }
    throw err;
  } finally {
    if (agent) {
      await disposeAgent(agent);
    }
    releaseLock();
  }
}

export function cursorAgentErrorStatus(err: CursorAgentError): number {
  return err.isRetryable ? 503 : 502;
}

export const gatewayHeaders = {
  mcpAttached: "X-Cursor-Gateway-Mcp-Attached",
  likelyDoubleOrchestration: "X-Cursor-Gateway-Likely-Double-Orchestration",
} as const;

export function applyCompletionDiagnosticHeaders(
  setHeader: (name: string, value: string) => void,
  meta: CompletionMeta,
): void {
  setHeader(gatewayHeaders.mcpAttached, meta.mcpAttached ? "true" : "false");
  if (meta.likelyDoubleOrchestration) {
    setHeader(gatewayHeaders.likelyDoubleOrchestration, "true");
  }
}
