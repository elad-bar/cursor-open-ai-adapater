export interface Env {
  host: string;
  port: number;
  cursorApiKeyFallback: string | undefined;
  modelsCacheTtlSeconds: number;
  /** Streamable HTTP MCP gateway URL (org-level); unset disables MCP injection. */
  mcpGatewayUrl: string | undefined;
  /** Seconds of SDK silence before emitting a streaming keepalive chunk; 0 disables. */
  streamIdleHeartbeatSeconds: number;
  /** Evict idle agent sessions from the in-memory map. */
  agentSessionTtlSeconds: number;
  /** Max entries in the agent session map (LRU eviction). */
  agentSessionMaxEntries: number;
  /** Optional request header name for external session id; unset uses OpenAI `user` only. */
  agentSessionHeader: string | undefined;
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

  const sessionTtlRaw = process.env.AGENT_SESSION_TTL_SECONDS ?? "3600";
  const agentSessionTtlSeconds = Number.parseInt(sessionTtlRaw, 10);
  if (!Number.isFinite(agentSessionTtlSeconds) || agentSessionTtlSeconds < 0) {
    throw new Error(`Invalid AGENT_SESSION_TTL_SECONDS: ${sessionTtlRaw}`);
  }

  const sessionMaxRaw = process.env.AGENT_SESSION_MAX_ENTRIES ?? "500";
  const agentSessionMaxEntries = Number.parseInt(sessionMaxRaw, 10);
  if (!Number.isFinite(agentSessionMaxEntries) || agentSessionMaxEntries < 1) {
    throw new Error(`Invalid AGENT_SESSION_MAX_ENTRIES: ${sessionMaxRaw}`);
  }

  const agentSessionHeader = process.env.AGENT_SESSION_HEADER?.trim() || undefined;

  cached = {
    host: process.env.HOST ?? "0.0.0.0",
    port,
    cursorApiKeyFallback: process.env.CURSOR_API_KEY?.trim() || undefined,
    modelsCacheTtlSeconds,
    mcpGatewayUrl,
    streamIdleHeartbeatSeconds,
    agentSessionTtlSeconds,
    agentSessionMaxEntries,
    agentSessionHeader,
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
