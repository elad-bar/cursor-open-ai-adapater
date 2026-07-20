import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { messagesToPrompt } from "../src/openai/messages-to-prompt.js";

describe("messagesToPrompt", () => {
  it("formats roles into labeled sections", () => {
    const prompt = messagesToPrompt([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);

    assert.match(prompt, /## System/);
    assert.match(prompt, /You are helpful\./);
    assert.match(prompt, /## User/);
    assert.match(prompt, /Hello/);
    assert.match(prompt, /## Assistant/);
    assert.match(prompt, /Hi there/);
  });

  it("joins multipart text content", () => {
    const prompt = messagesToPrompt([
      {
        role: "user",
        content: [{ text: "line1" }, { text: "line2" }],
      },
    ]);
    assert.match(prompt, /line1\nline2/);
  });
});

describe("extractLatestUserTurn", () => {
  it("returns the last user message only", async () => {
    const { extractLatestUserTurn } = await import("../src/openai/messages-to-prompt.js");
    const turn = extractLatestUserTurn([
      { role: "user", content: "first" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "second" },
    ]);
    assert.equal(turn, "second");
  });
});
