import {
  Agent,
  CursorAgentError,
  type AgentOptions,
  type RunResult,
  type SDKMessage,
  type TextBlock,
} from "@cursor/sdk";
import { getEnv } from "../config/env.js";

export class CompletionConfigError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "CompletionConfigError";
  }
}

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

function buildAgentOptions(apiKey: string, modelId: string): AgentOptions {
  const env = getEnv();
  const model = { id: modelId };

  if (env.cursorRuntime === "local") {
    return {
      apiKey,
      model,
      local: {
        cwd: env.cursorLocalCwd,
        settingSources: [],
      },
    };
  }

  if (env.cursorCloudRepos.length === 0) {
    throw new CompletionConfigError(
      "Cloud runtime requires CURSOR_CLOUD_REPOS (comma-separated git URLs).",
    );
  }

  return {
    apiKey,
    model,
    cloud: {
      repos: env.cursorCloudRepos.map((url) => ({ url })),
      skipReviewerRequest: true,
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
  prompt: string;
  requestId: string;
}): Promise<{ content: string; id: string; usage: RunResult["usage"] }> {
  const options = buildAgentOptions(params.apiKey, params.model);

  try {
    const result = await Agent.prompt(params.prompt, options);
    return handleRunResult(result, params.model, params.requestId);
  } catch (err) {
    if (err instanceof CompletionConfigError || err instanceof CompletionRunError) {
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
  prompt: string;
  requestId: string;
}): AsyncGenerator<string, RunResult, void> {
  const options = buildAgentOptions(params.apiKey, params.model);

  await using agent = await Agent.create(options);
  const run = await agent.send(params.prompt);

  logCompletion({
    request_id: params.requestId,
    model: params.model,
    run_id: run.id,
    agent_id: run.agentId,
    phase: "started",
  });

  try {
    for await (const message of run.stream()) {
      const text = assistantTextFromMessage(message);
      if (text) {
        yield text;
      }
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
