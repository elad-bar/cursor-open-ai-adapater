export type CursorRuntime = "cloud" | "local";

export interface Env {
  host: string;
  port: number;
  cursorApiKeyFallback: string | undefined;
  cursorRuntime: CursorRuntime;
  cursorCloudRepos: string[];
  cursorLocalCwd: string;
  modelsCacheTtlSeconds: number;
}

function parseRuntime(value: string | undefined): CursorRuntime {
  if (value === "local") return "local";
  return "cloud";
}

function parseCloudRepos(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const portRaw = process.env.PORT ?? "8080";
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${portRaw}`);
  }

  const ttlRaw = process.env.MODELS_CACHE_TTL_SECONDS ?? "600";
  const modelsCacheTtlSeconds = Number.parseInt(ttlRaw, 10);
  if (!Number.isFinite(modelsCacheTtlSeconds) || modelsCacheTtlSeconds < 0) {
    throw new Error(`Invalid MODELS_CACHE_TTL_SECONDS: ${ttlRaw}`);
  }

  cached = {
    host: process.env.HOST ?? "0.0.0.0",
    port,
    cursorApiKeyFallback: process.env.CURSOR_API_KEY?.trim() || undefined,
    cursorRuntime: parseRuntime(process.env.CURSOR_RUNTIME),
    cursorCloudRepos: parseCloudRepos(process.env.CURSOR_CLOUD_REPOS),
    cursorLocalCwd: process.env.CURSOR_LOCAL_CWD?.trim() || ".",
    modelsCacheTtlSeconds,
  };

  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
