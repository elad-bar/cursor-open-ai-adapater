import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JsonNormalizeError,
  normalizeJsonAssistantContent,
} from "../src/api/openai/json-response.js";

describe("normalizeJsonAssistantContent", () => {
  it("returns compact JSON for a pure object string", () => {
    assert.equal(normalizeJsonAssistantContent('{"a":1}'), '{"a":1}');
  });

  it("strips markdown fences", () => {
    assert.equal(
      normalizeJsonAssistantContent("```json\n{\"x\":true}\n```"),
      '{"x":true}',
    );
  });

  it("extracts JSON from leading prose", () => {
    assert.equal(
      normalizeJsonAssistantContent('Summary first.\n{"potential_threat_level":0}'),
      '{"potential_threat_level":0}',
    );
  });

  it("throws when no JSON object is found", () => {
    assert.throws(
      () => normalizeJsonAssistantContent("not json at all"),
      JsonNormalizeError,
    );
  });

  it("rejects JSON arrays at the top level", () => {
    assert.throws(() => normalizeJsonAssistantContent("[1,2]"), JsonNormalizeError);
  });
});
