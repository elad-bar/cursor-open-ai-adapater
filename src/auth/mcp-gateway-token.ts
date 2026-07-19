import type { Context } from "hono";

export const MCP_GATEWAY_TOKEN_HEADER = "X-Mcp-Gateway-Token";

export function resolveMcpGatewayToken(c: Context): string | null {
  const raw = c.req.header(MCP_GATEWAY_TOKEN_HEADER);
  if (!raw?.trim()) return null;
  return raw.trim();
}
