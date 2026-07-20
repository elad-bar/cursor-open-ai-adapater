export interface Env {
  host: string;
  port: number;
  cursorApiKeyFallback: string | undefined;
  modelsCacheTtlSeconds: number;
  /** Streamable HTTP MCP gateway URL (org-level); unset disables MCP injection. */
  mcpGatewayUrl: string | undefined;
  /** Seconds of SDK silence before emitting a streaming keepalive chunk; 0 disables. */
  streamIdleHeartbeatSeconds: number;
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

  const mcpGatewayRaw = process.env.MCP_GATEWAY_URL?.trim();
  let mcpGatewayUrl: string | undefined;
  if (mcpGatewayRaw) {
    try {
      const parsed = new URL(mcpGatewayRaw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`MCP_GATEWAY_URL must be http or https, got ${parsed.protocol}`);
      }
      mcpGatewayUrl = parsed.toString().replace(/\/$/, "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid MCP_GATEWAY_URL: ${message}`);
    }
  }

  const heartbeatRaw = process.env.STREAM_IDLE_HEARTBEAT_SECONDS ?? "30";
  const streamIdleHeartbeatSeconds = Number.parseInt(heartbeatRaw, 10);
  if (!Number.isFinite(streamIdleHeartbeatSeconds) || streamIdleHeartbeatSeconds < 0) {
    throw new Error(`Invalid STREAM_IDLE_HEARTBEAT_SECONDS: ${heartbeatRaw}`);
  }

  cached = {
    host: process.env.HOST ?? "0.0.0.0",
    port,
    cursorApiKeyFallback: process.env.CURSOR_API_KEY?.trim() || undefined,
    modelsCacheTtlSeconds,
    mcpGatewayUrl,
    streamIdleHeartbeatSeconds,
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
