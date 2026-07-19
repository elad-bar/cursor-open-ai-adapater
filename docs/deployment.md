# Deployment

## Container image (GHCR)

CI publishes to GitHub Container Registry on pushes to `main`, version tags (`v*`), and manual `workflow_dispatch`:

```text
ghcr.io/<github-owner>/cursor-sdk-open-ai:latest
ghcr.io/<github-owner>/cursor-sdk-open-ai:<git-sha>
ghcr.io/<github-owner>/cursor-sdk-open-ai:<semver>   # on version tags
```

Pull (public package or with `read:packages` token):

```bash
docker pull ghcr.io/<owner>/cursor-sdk-open-ai:latest
```

Run:

```bash
docker run --rm -p 8080:8080 \
  -e CURSOR_RUNTIME=cloud \
  -e CURSOR_CLOUD_REPOS=https://github.com/org/repo \
  ghcr.io/<owner>/cursor-sdk-open-ai:latest
```

Clients authenticate with **`Authorization: Bearer <cursor_api_key>`** — the same value as the OpenAI API key in Archestra.

## Docker Compose

Copy [`.env.example`](../.env.example) to `.env`, set `CURSOR_CLOUD_REPOS` (and optionally `CURSOR_API_KEY` for dev-only fallback).

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
| `CURSOR_RUNTIME` | `cloud` | `cloud` or `local` |
| `CURSOR_CLOUD_REPOS` | — | Comma-separated git URLs; **required** when `CURSOR_RUNTIME=cloud` |
| `CURSOR_LOCAL_CWD` | `.` | Working directory for local agents |
| `MODELS_CACHE_TTL_SECONDS` | `600` | Cache TTL for `GET /v1/models` per API key |

### Production (Archestra / K8s)

- Use **`CURSOR_RUNTIME=cloud`** and set **`CURSOR_CLOUD_REPOS`** on the gateway deployment.
- Store the **Cursor API key in Archestra** as the OpenAI-compatible provider API key; do not rely on `CURSOR_API_KEY` on the gateway in shared environments.
- Increase upstream timeouts for chat completions — Cursor agent runs can take minutes.

### Local development

- **`pnpm dev`** on the host with `CURSOR_RUNTIME=local` and a repo checkout as `CURSOR_LOCAL_CWD`.
- Docker local agents need a **volume mount** for `cwd`; cloud runtime is simpler for containerized deploys.

## Archestra LLM provider

1. Deploy this gateway where Archestra can reach it (HTTPS recommended).
2. Add a **custom OpenAI-compatible provider**:
   - **Base URL:** `https://<gateway-host>` (paths are `/v1/models`, `/v1/chat/completions`).
   - **API key:** your **Cursor API key** (same as `Authorization: Bearer` toward the gateway).
3. Create an **LLM proxy**, select models discovered from `/v1/models`.
4. Attach the proxy to agents.

Each completion runs a **Cursor agent** (tools, repo context), not a lightweight chat token stream. Plan workloads and timeouts accordingly.

## API surface

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |
| GET | `/v1/models` | Bearer = Cursor key |
| POST | `/v1/chat/completions` | Bearer = Cursor key |

See [architecture.md](architecture.md) for error mapping and streaming behavior.
