import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldResumeAgentSession } from "../src/session/should-resume-agent-session.js";

describe("shouldResumeAgentSession", () => {
  it("returns false without external session id", () => {
    assert.equal(
      shouldResumeAgentSession([{ role: "user", content: "hi" }], undefined),
      false,
    );
  });

  it("returns true when last message is user", () => {
    assert.equal(
      shouldResumeAgentSession(
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "again" },
        ],
        "sess-1",
      ),
      true,
    );
  });

  it("returns false for upstream tool-loop hops ending in tool or assistant", () => {
    assert.equal(
      shouldResumeAgentSession(
        [
          { role: "user", content: "what ac are on?" },
          { role: "assistant", content: "calling tools" },
          { role: "tool", content: "sensor data" },
        ],
        "sess-1",
      ),
      false,
    );
    assert.equal(
      shouldResumeAgentSession(
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "done" },
        ],
        "sess-1",
      ),
      false,
    );
  });
});
