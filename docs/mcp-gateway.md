# MCP gateway injection

Attach a **streamable HTTP MCP gateway** to Cursor agent runs initiated by this OpenAI-compatible gateway. **Cursor** discovers and invokes tools on that endpoint; the upstream LLM client does not orchestrate tools via OpenAI `tools`.

Typical use: an LLM proxy (e.g. **Archestra**) forwards chat completions here while users bring their own MCP gateway credentials.

## Credentials (two per user)

| Credential | HTTP | Purpose |
|------------|------|---------|
| Cursor API key | `Authorization: Bearer <cursor_key>` | Cursor SDK (`apiKey`) |
| MCP gateway token | `X-Mcp-Gateway-Token: <token>` | Bearer auth to `MCP_GATEWAY_URL` |

The MCP token format depends on your gateway provider (e.g. Archestra personal `arch_…` from Settings).

## Gateway environment

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_GATEWAY_URL` | No | Full streamable HTTP MCP URL from your gateway provider. When unset, chat completions behave as before (no MCP injection). |

Transport to Cursor SDK is always **`http`**.

## Runtime behavior

- `MCP_GATEWAY_URL` unset → never attach MCP.
- `MCP_GATEWAY_URL` set + `X-Mcp-Gateway-Token` present → Cursor agent gets `mcpServers.gateway` with `Authorization: Bearer <token>`.
- `MCP_GATEWAY_URL` set + header absent → Cursor run **without** MCP (no error).

Structured logs include `mcp_attached: true|false` per completion; tokens are never logged.

## Setup (platform admin)

1. Deploy **cursor-sdk-open-ai** where your LLM proxy can reach it (HTTPS recommended).
2. Copy the org (or shared) gateway **streamable HTTP URL** into `MCP_GATEWAY_URL` on this deployment.
3. Register a **custom OpenAI-compatible provider** pointing at this service (`/v1/models`, `/v1/chat/completions`).
4. Create an **LLM proxy** and attach it to agents that should use Cursor models.

## Setup (each user)

1. Set the provider **API key** to that user’s **Cursor API key**.
2. Add provider **extra header** **`X-Mcp-Gateway-Token`** = that user’s MCP gateway token from your provider.
3. Chat with an agent that uses the Cursor model via the LLM proxy.

Per-user MCP visibility depends on the gateway honoring the Bearer token on `MCP_GATEWAY_URL`.

## Example: Archestra

1. **MCP Gateways → plug/connection** → copy streamable HTTP URL → `MCP_GATEWAY_URL`.
2. Provider API key = user’s Cursor key.
3. Extra header **`X-Mcp-Gateway-Token`** = user’s **`arch_…`** from Archestra Settings (MCP Gateway / A2A token).
4. Archestra must **forward `X-Mcp-Gateway-Token` on every** upstream `chat/completions` request (including follow-up turns).

## End-to-end flow

1. User sends a message via the LLM proxy (Cursor model).
2. Proxy `POST`s to this gateway with Cursor Bearer + `X-Mcp-Gateway-Token`.
3. Gateway runs a local Cursor agent with MCP pointed at `MCP_GATEWAY_URL` and the user’s token.
4. Cursor discovers and invokes tools through the MCP gateway.
5. Gateway returns OpenAI-shaped text (or SSE) to the proxy.

## Failure modes

| Symptom | Likely cause |
|---------|----------------|
| Model says no MCP / empty tools | Header missing, wrong token, or `MCP_GATEWAY_URL` unset |
| MCP 401 | Rotated or revoked gateway token — update provider header |
| Gateway cannot reach MCP host | Network/firewall from this service to the MCP URL |
| Tools work on native LLM but not Cursor | Configure header + `MCP_GATEWAY_URL` for this path |

## Related docs

- [deployment.md](deployment.md) — env vars and Docker
- [architecture.md](architecture.md) — component diagram
- [product.md](product.md) — scope and non-goals
