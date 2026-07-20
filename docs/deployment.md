# Deployment

## Container image (GHCR)

CI publishes to GitHub Container Registry on pushes to `main`, version tags (`v*`), and manual `workflow_dispatch`:

```text
ghcr.io/<github-owner>/cursor-open-ai-adapater:latest
```

Pull (public package or with `read:packages` token):

```bash
docker pull ghcr.io/<owner>/cursor-open-ai-adapater:latest
```

Run (local Cursor agents use the container process working directory):

```bash
docker run --rm -p 8080:8080 ghcr.io/<owner>/cursor-open-ai-adapater:latest
```

To run agents against a repo checkout, set the container working directory and mount the tree (not configurable via env):

```bash
docker run --rm -p 8080:8080 -w /workspace -v /path/to/your/repo:/workspace \
  ghcr.io/<owner>/cursor-open-ai-adapater:latest
```

Clients authenticate with **`Authorization: Bearer <cursor_api_key>`** — the same value as the OpenAI API key in Archestra.

## Docker Compose

Copy [`.env.example`](../.env.example) to `.env` (optional `CURSOR_API_KEY` for dev-only fallback).

```bash
docker compose pull
docker compose up
```

Health (uses container `PORT`, default `8080`): `curl http://localhost:${PORT:-8080}/health`

Container and image health checks probe `http://127.0.0.1:$PORT/health` with the same default.

Models: `curl http://localhost:${PORT:-8080}/v1/models -H "Authorization: Bearer $CURSOR_API_KEY"`

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Listen port |
| `CURSOR_API_KEY` | — | Dev-only fallback if clients omit Bearer (not for multi-tenant) |
| `MODELS_CACHE_TTL_SECONDS` | `600` | Cache TTL for `GET /v1/models` per API key |
| `MCP_GATEWAY_URL` | — | Optional. Streamable HTTP MCP URL from your gateway provider. When set and clients send `X-Mcp-Gateway-Token`, chat completions attach that MCP to Cursor (Bearer = user token). See [mcp-gateway.md](mcp-gateway.md). |
| `STREAM_IDLE_HEARTBEAT_SECONDS` | `30` | While **streaming**, emit invisible `delta.content` keepalives if the Cursor SDK is silent this long (seconds). Use `0` to disable. Helps Archestra’s ~40s “no response progress” UI during long tool runs; unrelated to `ARCHESTRA_LLM_PROXY_UPSTREAM_TIMEOUT_MS`. |

There is **no** cloud repo or `cwd` configuration. The Cursor SDK always runs **local** agents with `cwd` = the gateway process current working directory (`process.cwd()`).

### Production (Archestra / K8s)

- Deploy the container with a **working directory and volume** (or image layout) that contains the codebase agents should use.
- Store each user’s **Cursor API key in Archestra** as the OpenAI-compatible provider API key; do not rely on `CURSOR_API_KEY` on the gateway in shared environments.
- For MCP tools on Cursor models, set **`MCP_GATEWAY_URL`** on the gateway and configure **`X-Mcp-Gateway-Token`** on the provider (per user). See [mcp-gateway.md](mcp-gateway.md).
- Increase upstream timeouts for chat completions — Cursor agent runs can take minutes.
- For Archestra streaming chat, leave **`STREAM_IDLE_HEARTBEAT_SECONDS`** at the default (`30`) so long Cursor tool phases still advance upstream response progress without noisy tool logs.

### Local development

- Run **`pnpm dev`** from your repo root so `process.cwd()` is that checkout.

## Archestra LLM provider

1. Deploy this gateway where Archestra can reach it (HTTPS recommended).
2. Add a **custom OpenAI-compatible provider**:
   - **Base URL:** `https://<gateway-host>` (paths are `/v1/models`, `/v1/chat/completions`).
   - **API key:** each user’s **Cursor API key** (same as `Authorization: Bearer` toward the gateway).
   - **Optional extra header:** `X-Mcp-Gateway-Token` = user’s MCP gateway token (required for MCP when `MCP_GATEWAY_URL` is set on the gateway).
3. Set gateway env **`MCP_GATEWAY_URL`** to your provider’s streamable HTTP MCP URL when you want Cursor agents to use that gateway.
4. Create an **LLM proxy**, select models discovered from `/v1/models`.
5. Attach the proxy to agents.

Each completion runs a **local Cursor agent** against the gateway’s working directory. Plan workloads, filesystem layout, and timeouts accordingly. MCP setup: [mcp-gateway.md](mcp-gateway.md).

## API surface

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |
| GET | `/v1/models` | Bearer = Cursor key |
| POST | `/v1/chat/completions` | Bearer = Cursor key; optional `X-Mcp-Gateway-Token` for MCP |

See [architecture.md](architecture.md) for error mapping and streaming behavior.
