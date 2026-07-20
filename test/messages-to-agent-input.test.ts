import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentInputHasUsableContent,
  applyJsonInstructionsToAgentInput,
  messagesToAgentInput,
} from "../src/api/openai/messages-to-agent-input.js";

describe("messagesToAgentInput", () => {
  it("returns string input for text-only messages", () => {
    const input = messagesToAgentInput([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ]);
    assert.equal(input.type, "string");
    if (input.type === "string") {
      assert.match(input.value, /Hello/);
    }
  });

  it("returns SDKUserMessage when images are present", () => {
    const input = messagesToAgentInput([
      {
        role: "user",
        content: [
          { type: "text", text: "Review these frames" },
          { type: "image_url", image_url: { url: "https://example.com/frame.jpg" } },
        ],
      },
    ]);
    assert.equal(input.type, "userMessage");
    if (input.type === "userMessage") {
      assert.match(input.value.text, /Review these frames/);
      assert.equal(input.value.images?.length, 1);
      assert.deepEqual(input.value.images?.[0], { url: "https://example.com/frame.jpg" });
    }
  });

  it("parses data URLs into base64 SDK images", () => {
    const input = messagesToAgentInput([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,abcd" },
          },
        ],
      },
    ]);
    assert.equal(input.type, "userMessage");
    if (input.type === "userMessage") {
      assert.deepEqual(input.value.images?.[0], { data: "abcd", mimeType: "image/png" });
    }
  });

  it("collects multiple frames from one user message", () => {
    const input = messagesToAgentInput([
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "https://a/1.jpg" } },
          { type: "image_url", image_url: { url: "https://a/2.jpg" } },
        ],
      },
    ]);
    assert.equal(input.type, "userMessage");
    if (input.type === "userMessage") {
      assert.equal(input.value.images?.length, 2);
    }
  });

  it("treats image-only messages as usable content", () => {
    const input = messagesToAgentInput([
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://a/1.jpg" } }],
      },
    ]);
    assert.equal(agentInputHasUsableContent(input), true);
  });
});

describe("applyJsonInstructionsToAgentInput", () => {
  it("appends JSON instructions when response_format is json_object", () => {
    const base = messagesToAgentInput([{ role: "user", content: "Hi" }]);
    const updated = applyJsonInstructionsToAgentInput(base, { type: "json_object" });
    assert.equal(updated.type, "string");
    if (updated.type === "string") {
      assert.match(updated.value, /single JSON object only/i);
    }
  });
});
