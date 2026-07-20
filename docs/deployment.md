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

Clients authenticate with **`Authorization: Bearer <cursor_api_key>`** (same value as the OpenAI API key field on upstream providers).

## Docker Compose

Copy [`.env.example`](../.env.example) to `.env` (optional `CURSOR_API_KEY` for dev-only fallback).

For agents against a host repo, mount the tree and set the process working directory:

```yaml
services:
  gateway:
    working_dir: /workspace
    volumes:
      - /path/to/your/repo:/workspace
```

See [docker-compose.yml](../docker-compose.yml) for a commented example.

```bash
docker compose pull
docker compose up
```

Health: `curl http://localhost:8080/health`

Models: `curl http://localhost:8080/v1/models -H "Authorization: Bearer $CURSOR_API_KEY"`

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | Listen port |
| `CURSOR_API_KEY` | — | Dev-only fallback if clients omit Bearer (not for multi-tenant) |
| `MODELS_CACHE_TTL_SECONDS` | `600` | Cache TTL for `GET /v1/models` per API key |
| `MCP_GATEWAY_URL` | — | Optional. Streamable HTTP MCP URL. When set and clients send `X-Mcp-Gateway-Token`, chat completions attach that MCP to Cursor. See [mcp-gateway.md](mcp-gateway.md). |
| `STREAM_IDLE_HEARTBEAT_SECONDS` | `30` | While **streaming**, emit invisible `delta.content` keepalives if the Cursor SDK is silent this long (seconds). Use `0` to disable. |
| `AGENT_SESSION_TTL_SECONDS` | `3600` | Idle TTL for in-memory session → `agent_id` map |
| `AGENT_SESSION_MAX_ENTRIES` | `500` | Max session entries (LRU eviction) |
| `AGENT_SESSION_HEADER` | — | Optional HTTP header name for external session id (before OpenAI `user`) |

There is **no** cloud repo or `cwd` configuration. The Cursor SDK always runs **local** agents with `cwd` = the gateway process current working directory (`process.cwd()`).

### Production (K8s / shared hosting)

- Deploy **one gateway instance per repo/environment** with explicit **working directory and volume** for the codebase agents should use.
- Per-tenant Cursor keys via client `Authorization: Bearer`; do not rely on shared `CURSOR_API_KEY` on the gateway.
- Set **`MCP_GATEWAY_URL`** and per-user **`X-Mcp-Gateway-Token`** when using injected MCP. See [mcp-gateway.md](mcp-gateway.md).
- Configure upstream **client/proxy timeouts** for multi-minute agent runs.
- Leave **`STREAM_IDLE_HEARTBEAT_SECONDS`** at `30` (or lower than your client’s stream progress threshold) during long tool phases.
- Set memory limits; use `restart: unless-stopped`; consider periodic restarts if native SDK memory still climbs.
- Send stable OpenAI **`user`** (or optional session header) on every turn in a conversation to enable session stickiness.

### Local development

- Run **`pnpm dev`** from your repo root so `process.cwd()` is that checkout.

## OpenAI-compatible provider

1. Deploy this gateway where clients can reach it (HTTPS recommended).
2. Register a **custom OpenAI-compatible provider**:
   - **Base URL:** `https://<gateway-host>` (paths `/v1/models`, `/v1/chat/completions`).
   - **API key:** each user’s **Cursor API key**.
   - **Optional extra header:** `X-Mcp-Gateway-Token` for MCP when `MCP_GATEWAY_URL` is set on the gateway.
3. Select models from `/v1/models`.

Each completion runs a **local Cursor agent** against the gateway’s working directory. Plan workloads, filesystem layout, and timeouts accordingly.

## API surface

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |
| GET | `/v1/models` | Bearer = Cursor key |
| POST | `/v1/chat/completions` | Bearer = Cursor key; optional `X-Mcp-Gateway-Token` for MCP |

See [architecture.md](architecture.md) for error mapping and streaming behavior.
