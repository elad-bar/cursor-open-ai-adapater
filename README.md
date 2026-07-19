# cursor-sdk-open-ai

OpenAI-compatible HTTP gateway that routes chat completions to the [Cursor SDK](https://cursor.com/docs/sdk). Use it with **LiteLLM**, **Archestra LLM proxies**, or any client that speaks the OpenAI API.

## What it does

- **`GET /v1/models`** — Lists models available to your Cursor account (backed by `Cursor.models.list()`).
- **`POST /v1/chat/completions`** — Runs a Cursor agent for the request and returns an OpenAI-shaped response (including streaming).

Your **Cursor API key is the credential**: configure it wherever the client expects an OpenAI API key (e.g. `Authorization: Bearer …` or the provider API key field in Archestra). The gateway uses that value for all Cursor SDK calls.

## Requirements

- Node.js **22+**
- [pnpm](https://pnpm.io/) 10+

## Local development

```bash
cp .env.example .env
# Optional: CURSOR_API_KEY for dev when omitting Bearer header

pnpm install
pnpm dev
```

```bash
curl http://localhost:8080/health
curl http://localhost:8080/v1/models -H "Authorization: Bearer $CURSOR_API_KEY"
```

Build and run compiled output:

```bash
pnpm build
pnpm start
```

## Docker

```bash
docker compose pull
docker compose up
```

See [docs/deployment.md](docs/deployment.md) for GHCR images, env vars, and Archestra setup. For **MCP tools** on Cursor runs via a streamable HTTP gateway, see [docs/mcp-gateway.md](docs/mcp-gateway.md).

## Archestra

1. Deploy this service where Archestra can reach it.
2. Add a **custom OpenAI-compatible provider** with this service’s base URL.
3. Set the provider **API key** to each user’s **Cursor API key**.
4. Create an **LLM proxy**, pick models from `/v1/models`, attach to agents.

**Optional — user MCP tools on Cursor runs:** set **`MCP_GATEWAY_URL`** (streamable HTTP URL from your MCP gateway provider) and configure the provider **extra header** **`X-Mcp-Gateway-Token`** with each user’s gateway token. Archestra example: [docs/mcp-gateway.md](docs/mcp-gateway.md).

## Important expectations

Each “completion” triggers a **local Cursor agent run** against the gateway process working directory (`process.cwd()`). Run the server from your repo root, or set Docker `-w` and volume mounts accordingly.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/product.md](docs/product.md) | Goals, users, scope, non-goals |
| [docs/architecture.md](docs/architecture.md) | Components, API mapping, auth |
| [docs/deployment.md](docs/deployment.md) | Docker, GHCR, Archestra |
| [docs/mcp-gateway.md](docs/mcp-gateway.md) | MCP gateway injection (`MCP_GATEWAY_URL`, `X-Mcp-Gateway-Token`) |

## License

TBD
