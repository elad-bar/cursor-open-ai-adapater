export interface Env {
  host: string;
  port: number;
  cursorApiKeyFallback: string | undefined;
  modelsCacheTtlSeconds: number;
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
    modelsCacheTtlSeconds,
  };

  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}

/** Working directory for Cursor local agents (not user-configurable). */
export function getAgentWorkingDirectory(): string {
  return process.cwd();
}
