# Product

## Vision

Make Cursor agent models usable anywhere that expects an **OpenAI-compatible LLM provider**—starting with **Archestra LLM proxies**—without bespoke Cursor SDK integration in every platform.

## Problem

- Platforms like Archestra discover models and invoke LLMs via **OpenAI-style** APIs (`/v1/models`, `/v1/chat/completions`).
- The Cursor SDK is an **agent runtime** (runs, streaming, local/cloud, MCP), not an OpenAI endpoint.
- Teams want to **pick Cursor models in the UI** and route governed agent traffic through Archestra while execution stays on Cursor.

## Solution

A small **compatibility gateway** that:

1. Accepts standard OpenAI client auth and request shapes.
2. Uses the **same secret the client sends as the OpenAI API key** as the **Cursor API key** for SDK calls.
3. Exposes account-visible models for UI pickers.
4. Maps chat completion requests to Cursor agent invocations and maps results back to OpenAI JSON (and SSE when streaming).

## Primary user stories

| As a… | I want to… | So that… |
|--------|------------|----------|
| Platform admin | Register one OpenAI-compatible base URL in Archestra | Agents can use Cursor without custom Archestra plugins |
| Admin | Paste my **Cursor API key** into the provider “OpenAI API key” field | I don’t manage a second credential type |
| Builder | See models from `/v1/models` | I only select models my Cursor account supports |
| Developer | Call the gateway from LiteLLM or curl | Existing tooling keeps working |

## Authentication (product rule)

**The OpenAI API key is the Cursor API key.**

- Clients send `Authorization: Bearer <cursor_api_key>` (OpenAI convention).
- Alternatively, provider UIs that store an “API key” field pass that value on each request; the gateway forwards it to the SDK as `api_key` / `CURSOR_API_KEY` for that request.
- Optional server default: `CURSOR_API_KEY` env var when the client omits a key (discouraged for multi-tenant Archestra; prefer per-proxy keys in Archestra).

Invalid or missing keys → OpenAI-style `401` with a clear error (not a generic agent failure).

## Scope (v1)

- OpenAI-compatible **`/v1/models`** and **`/v1/chat/completions`**.
- Model list from **`Cursor.models.list()`** for the authenticated key.
- Non-streaming and streaming assistant **text** in the response.
- Documented behavior for Archestra LLM proxy setup.
- **Local-only** Cursor SDK runtime (`process.cwd()` workspace; not user-configurable).
- **MCP gateway injection:** when `MCP_GATEWAY_URL` is set, attach streamable HTTP MCP to Cursor runs when clients send **`X-Mcp-Gateway-Token`** (per-user Bearer to the remote gateway). See [mcp-gateway.md](mcp-gateway.md).

## Non-goals (v1)

- Full parity with every OpenAI parameter (`logprobs`, `seed`, parallel tool calls, strict JSON schema guarantees).
- Mapping remote MCP into OpenAI `tools` on the wire for the LLM proxy to orchestrate (native proxy tool loop). Cursor runs its own MCP loop when injection is enabled.
- Server-side lookup/cache of MCP URLs per user (URL is deployment env; auth is per-request header).
- Replacing Cursor Dashboard for run inspection (link/log `agent_id` / `run_id` for operators).
- Cloud agent runtime and repo URL configuration via env.

## Success criteria

- Archestra can register the gateway, **list models**, and complete a chat turn using a selected Cursor model id.
- Operators configure **one key type**: Cursor key in the OpenAI key field.
- Documentation states clearly that backends are **agent runs**, not instant chat tokens.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Long runtimes vs chat timeouts | Document timeouts; consider async/job pattern in a later version |
| Nested agents (Archestra + Cursor) | Product doc: use Cursor backend for repo/coding; keep Archestra for governance/MCP |
| Token usage in Archestra | Non-stream and streaming (`stream_options.include_usage`) return best-effort `usage` when the Cursor SDK reports counts; otherwise omit |
| Model list drift | Cache with TTL; refresh on proxy configuration |

## Glossary

- **Gateway** — This OpenAI-compatible service.
- **Cursor API key** — Key from Cursor Dashboard / team service account; used as the OpenAI API key toward the gateway.
- **LLM proxy (Archestra)** — Org routing object that points at a provider and model set.
