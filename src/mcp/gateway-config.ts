import type { AgentOptions } from "@cursor/sdk";
import { getEnv } from "../config/env.js";

export const MCP_GATEWAY_SERVER_NAME = "gateway";

export function getMcpGatewayUrl(): string | undefined {
  return getEnv().mcpGatewayUrl;
}

export function buildMcpGatewayServers(
  gatewayToken: string,
): AgentOptions["mcpServers"] | undefined {
  const url = getMcpGatewayUrl();
  if (!url || !gatewayToken.trim()) return undefined;

  return {
    [MCP_GATEWAY_SERVER_NAME]: {
      type: "http",
      url,
      headers: {
        Authorization: `Bearer ${gatewayToken.trim()}`,
      },
    },
  };
}
