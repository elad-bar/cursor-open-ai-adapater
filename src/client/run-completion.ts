import { readFile } from "node:fs/promises";
import type OpenAI from "openai";
import type { ChatCompletionCreateParams, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildUserMessage } from "./image-message.js";
import type { ClientOptions } from "./parse-args.js";

export interface RunCompletionParams {
  client: OpenAI;
  model: string;
  prompt: string;
  userMessage?: ChatCompletionMessageParam;
  options: ClientOptions;
  schema?: Record<string, unknown>;
}

type SdkResponseFormat = NonNullable<ChatCompletionCreateParams["response_format"]>;

function buildResponseFormat(
  options: ClientOptions,
  schema?: Record<string, unknown>,
): SdkResponseFormat | undefined {
  if (options.json) {
    return { type: "json_object" };
  }
  if (options.schemaPath && schema) {
    return {
      type: "json_schema",
      json_schema: {
        name: "dev",
        strict: true,
        schema,
      },
    };
  }
  return undefined;
}

function isJsonMode(options: ClientOptions): boolean {
  return options.json || Boolean(options.schemaPath);
}

function printJsonContent(content: string): void {
  const parsed = JSON.parse(content) as unknown;
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

function logUsage(
  verbose: boolean,
  usage: OpenAI.Completions.CompletionUsage | null | undefined,
): void {
  if (!verbose || !usage) return;
  process.stderr.write(
    `usage: prompt_tokens=${usage.prompt_tokens ?? 0} completion_tokens=${usage.completion_tokens ?? 0} total_tokens=${usage.total_tokens ?? 0}\n`,
  );
}

export async function loadJsonSchemaFile(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Schema file must contain a JSON object: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

export async function runCompletion(params: RunCompletionParams): Promise<void> {
  const { client, model, prompt, userMessage, options, schema } = params;
  const responseFormat = buildResponseFormat(options, schema);
  const jsonMode = isJsonMode(options);
  const message = userMessage ?? { role: "user" as const, content: prompt };

  if (options.stream) {
    const stream = await client.chat.completions.create({
      model,
      messages: [message],
      stream: true,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    });

    let fullContent = "";
    let usage: OpenAI.Completions.CompletionUsage | null | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        if (jsonMode) {
          fullContent += delta;
        } else {
          process.stdout.write(delta);
        }
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
    }

    if (jsonMode) {
      if (fullContent) {
        printJsonContent(fullContent);
      }
    } else {
      process.stdout.write("\n");
    }

    logUsage(options.verbose, usage);
    return;
  }

  const res = await client.chat.completions.create({
    model,
    messages: [message],
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });

  const content = res.choices[0]?.message?.content ?? "";
  if (jsonMode && content) {
    printJsonContent(content);
  } else {
    process.stdout.write(`${content}\n`);
  }

  logUsage(options.verbose, res.usage);
}
