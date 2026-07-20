import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMcpGatewayServers,
  getMcpGatewayUrl,
  MCP_GATEWAY_SERVER_NAME,
} from "../src/api/mcp/gateway-config.js";
import { getEnv, resetEnvCache } from "../src/api/config/env.js";

describe("buildMcpGatewayServers", () => {
  it("returns undefined when MCP_GATEWAY_URL is unset", () => {
    const prev = process.env.MCP_GATEWAY_URL;
    delete process.env.MCP_GATEWAY_URL;
    resetEnvCache();

    assert.equal(getMcpGatewayUrl(), undefined);
    assert.equal(buildMcpGatewayServers("token_abc"), undefined);

    if (prev !== undefined) process.env.MCP_GATEWAY_URL = prev;
    resetEnvCache();
  });

  it("builds http mcpServers with Bearer header", () => {
    const prev = process.env.MCP_GATEWAY_URL;
    process.env.MCP_GATEWAY_URL = "https://mcp.example.com/v1/mcp/my-gateway";
    resetEnvCache();

    const servers = buildMcpGatewayServers("user_gateway_token");
    const entry = servers?.[MCP_GATEWAY_SERVER_NAME];
    assert.ok(entry);
    assert.equal(entry.type, "http");
    assert.equal(entry.url, "https://mcp.example.com/v1/mcp/my-gateway");
    assert.deepEqual(entry.headers, {
      Authorization: "Bearer user_gateway_token",
    });

    if (prev !== undefined) process.env.MCP_GATEWAY_URL = prev;
    else delete process.env.MCP_GATEWAY_URL;
    resetEnvCache();
  });
});

describe("getEnv MCP_GATEWAY_URL validation", () => {
  it("rejects invalid URL", () => {
    const prev = process.env.MCP_GATEWAY_URL;
    process.env.MCP_GATEWAY_URL = "not-a-url";
    resetEnvCache();

    assert.throws(() => getEnv(), /Invalid MCP_GATEWAY_URL/);

    if (prev !== undefined) process.env.MCP_GATEWAY_URL = prev;
    else delete process.env.MCP_GATEWAY_URL;
    resetEnvCache();
  });

  it("strips trailing slash from valid URL", () => {
    const prev = process.env.MCP_GATEWAY_URL;
    process.env.MCP_GATEWAY_URL = "https://mcp.example.com/v1/mcp/gateway/";
    resetEnvCache();

    assert.equal(getEnv().mcpGatewayUrl, "https://mcp.example.com/v1/mcp/gateway");

    if (prev !== undefined) process.env.MCP_GATEWAY_URL = prev;
    else delete process.env.MCP_GATEWAY_URL;
    resetEnvCache();
  });
});
