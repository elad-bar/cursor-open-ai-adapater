import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import {
  MCP_GATEWAY_TOKEN_HEADER,
  resolveMcpGatewayToken,
} from "../src/api/auth/mcp-gateway-token.js";

describe("resolveMcpGatewayToken", () => {
  it("reads X-Mcp-Gateway-Token header", async () => {
    const app = new Hono();
    app.get("/t", (c) => c.text(resolveMcpGatewayToken(c) ?? ""));

    const res = await app.request("/t", {
      headers: { [MCP_GATEWAY_TOKEN_HEADER]: "user_mcp_token" },
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "user_mcp_token");
  });

  it("trims whitespace", async () => {
    const app = new Hono();
    app.get("/t", (c) => c.text(resolveMcpGatewayToken(c) ?? ""));

    const res = await app.request("/t", {
      headers: { [MCP_GATEWAY_TOKEN_HEADER]: "  trimmed_token  " },
    });
    assert.equal(await res.text(), "trimmed_token");
  });

  it("returns null when header absent or empty", async () => {
    const app = new Hono();
    app.get("/t", (c) => c.text(resolveMcpGatewayToken(c) === null ? "null" : "set"));

    const absent = await app.request("/t");
    assert.equal(await absent.text(), "null");

    const empty = await app.request("/t", {
      headers: { [MCP_GATEWAY_TOKEN_HEADER]: "   " },
    });
    assert.equal(await empty.text(), "null");
  });
});
