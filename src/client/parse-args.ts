import { parseArgs } from "node:util";

export class ClientArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientArgsError";
  }
}

export interface ClientOptions {
  model: string | undefined;
  promptFromArgv: string | undefined;
  file: string | undefined;
  imagePath: string | undefined;
  json: boolean;
  schemaPath: string | undefined;
  stream: boolean;
  verbose: boolean;
  help: boolean;
}

export function parseClientArgs(argv: string[]): ClientOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      model: { type: "string" },
      file: { type: "string" },
      image: { type: "string" },
      json: { type: "boolean", default: false },
      schema: { type: "string" },
      stream: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  const promptFromArgv =
    positionals.length > 0 ? positionals.join(" ").trim() || undefined : undefined;

  return {
    model: values.model,
    promptFromArgv,
    file: values.file,
    imagePath: values.image,
    json: values.json === true,
    schemaPath: values.schema,
    stream: values.stream === true,
    verbose: values.verbose === true,
    help: values.help === true,
  };
}

export function validateClientOptions(options: ClientOptions): void {
  if (options.json && options.schemaPath) {
    throw new ClientArgsError("Cannot use --json together with --schema");
  }

  if (options.file && options.promptFromArgv) {
    throw new ClientArgsError("Use either a positional prompt or --file, not both");
  }

  if (!options.model?.trim()) {
    throw new ClientArgsError("Missing --model");
  }
}

export const CLIENT_HELP = `Usage: dev:client [options] [--] [prompt]

Call the local OpenAI-compatible bridge (pnpm dev).

Options:
  --model <id>        Model id (required)
  --file <path>       Read prompt from a UTF-8 file
  --image <path>      Attach an image (png, jpg, webp, gif) to the user message
  --json              response_format: json_object
  --schema <path>     response_format: json_schema (JSON Schema file)
  --stream            Stream assistant text to stdout
  --verbose           Log token usage to stderr
  -h, --help          Show this help

Environment:
  CURSOR_API_KEY          Bearer token (also loaded from .env in repo root)
`;
