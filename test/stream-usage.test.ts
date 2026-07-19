import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TokenUsage } from "@cursor/sdk";
import { mapTokenUsage } from "../src/openai/completions-mapper.js";
import { buildUsageChunk } from "../src/openai/stream-sse.js";

describe("mapTokenUsage", () => {
  it("maps SDK TokenUsage to OpenAI usage fields", () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    assert.deepEqual(mapTokenUsage(usage), {
      prompt_tokens: 100,
      completion_tokens: 40,
      total_tokens: 140,
    });
  });

  it("returns undefined when usage is missing", () => {
    assert.equal(mapTokenUsage(undefined), undefined);
  });

  it("returns undefined when all counts are zero", () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    assert.equal(mapTokenUsage(usage), undefined);
  });
});

describe("buildUsageChunk", () => {
  it("emits OpenAI trailing usage chunk shape", () => {
    const chunk = buildUsageChunk({
      id: "chatcmpl-test",
      model: "test-model",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    assert.equal(chunk.object, "chat.completion.chunk");
    assert.equal(chunk.id, "chatcmpl-test");
    assert.equal(chunk.model, "test-model");
    assert.deepEqual(chunk.choices, []);
    assert.deepEqual(chunk.usage, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });
});
