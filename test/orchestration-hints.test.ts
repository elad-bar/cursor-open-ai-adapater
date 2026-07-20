import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { likelyDoubleOrchestration, countToolMessages } from "../src/openai/orchestration-hints.js";

describe("orchestration-hints", () => {
  it("detects likely double orchestration", () => {
    const messages = [
      { role: "user" as const, content: "hi" },
      { role: "tool" as const, content: "result" },
    ];
    assert.equal(countToolMessages(messages), 1);
    assert.equal(likelyDoubleOrchestration(messages, true), true);
    assert.equal(likelyDoubleOrchestration(messages, false), false);
  });
});
