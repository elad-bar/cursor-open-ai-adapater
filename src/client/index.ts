import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { stdin as input } from "node:process";
import OpenAI from "openai";
import { loadClientConfig } from "./config.js";
import { createBridgeClient } from "./create-bridge-client.js";
import {
  CLIENT_HELP,
  ClientArgsError,
  parseClientArgs,
  validateClientOptions,
} from "./parse-args.js";
import { loadJsonSchemaFile, runCompletion } from "./run-completion.js";
import { buildUserMessage } from "./image-message.js";

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../.env") });

async function readStdinPrompt(): Promise<string | undefined> {
  if (input.isTTY) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text || undefined;
}

async function resolvePrompt(options: ReturnType<typeof parseClientArgs>): Promise<string> {
  if (options.file) {
    return (await readFile(options.file, "utf8")).trim();
  }
  if (options.promptFromArgv) {
    return options.promptFromArgv;
  }
  const fromStdin = await readStdinPrompt();
  if (fromStdin) {
    return fromStdin;
  }
  throw new ClientArgsError(
    "Missing prompt: pass positional args, --file, or pipe stdin",
  );
}

function formatApiError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    const body =
      err.error && typeof err.error === "object"
        ? JSON.stringify(err.error, null, 2)
        : String(err.error ?? "");
    return body ? `${err.message}\n${body}` : err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export async function main(argv: string[]): Promise<number> {
  let options;
  try {
    options = parseClientArgs(argv);
  } catch (err) {
    if (err instanceof ClientArgsError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  if (options.help) {
    process.stdout.write(CLIENT_HELP);
    return 0;
  }

  try {
    validateClientOptions(options);
  } catch (err) {
    if (err instanceof ClientArgsError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const config = loadClientConfig();
  const model = options.model!.trim();

  let prompt: string;
  try {
    prompt = await resolvePrompt(options);
  } catch (err) {
    if (err instanceof ClientArgsError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }

  let schema: Record<string, unknown> | undefined;
  if (options.schemaPath) {
    try {
      schema = await loadJsonSchemaFile(options.schemaPath);
    } catch (err) {
      process.stderr.write(
        `Failed to read schema: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  }

  const client = createBridgeClient(config);

  let userMessage;
  if (options.imagePath) {
    try {
      userMessage = await buildUserMessage(prompt, options.imagePath);
    } catch (err) {
      process.stderr.write(
        `Failed to read image: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 1;
    }
  }

  try {
    await runCompletion({
      client,
      model,
      prompt,
      userMessage,
      options,
      schema,
    });
    return 0;
  } catch (err) {
    process.stderr.write(`${formatApiError(err)}\n`);
    return 1;
  }
}

const exitCode = await main(process.argv.slice(2));
process.exit(exitCode);
