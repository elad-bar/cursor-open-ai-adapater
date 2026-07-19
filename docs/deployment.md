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
docker compose up --build
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

There is **no** cloud repo or `cwd` configuration. The Cursor SDK always runs **local** agents with `cwd` = the gateway process current working directory (`process.cwd()`).

### Production (Archestra / K8s)

- Deploy the container with a **working directory and volume** (or image layout) that contains the codebase agents should use.
- Store the **Cursor API key in Archestra** as the OpenAI-compatible provider API key; do not rely on `CURSOR_API_KEY` on the gateway in shared environments.
- Increase upstream timeouts for chat completions — Cursor agent runs can take minutes.

### Local development

- Run **`pnpm dev`** from your repo root so `process.cwd()` is that checkout.

## Archestra LLM provider

1. Deploy this gateway where Archestra can reach it (HTTPS recommended).
2. Add a **custom OpenAI-compatible provider**:
   - **Base URL:** `https://<gateway-host>` (paths are `/v1/models`, `/v1/chat/completions`).
   - **API key:** your **Cursor API key** (same as `Authorization: Bearer` toward the gateway).
3. Create an **LLM proxy**, select models discovered from `/v1/models`.
4. Attach the proxy to agents.

Each completion runs a **local Cursor agent** against the gateway’s working directory. Plan workloads, filesystem layout, and timeouts accordingly.

## API surface

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |
| GET | `/v1/models` | Bearer = Cursor key |
| POST | `/v1/chat/completions` | Bearer = Cursor key |

See [architecture.md](architecture.md) for error mapping and streaming behavior.
