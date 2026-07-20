import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "../src/config/env.js";
import { resolveExternalSessionId } from "../src/session/resolve-external-session-id.js";

describe("resolveExternalSessionId", () => {
  it("uses OpenAI user when no session header configured", () => {
    resetEnvCache();
    delete process.env.AGENT_SESSION_HEADER;
    resetEnvCache();
    const c = {
      req: { header: () => undefined },
    } as unknown as Parameters<typeof resolveExternalSessionId>[0];
    assert.equal(resolveExternalSessionId(c, "conv-99"), "conv-99");
    assert.equal(resolveExternalSessionId(c, "  "), undefined);
  });

  it("prefers configured header over user", () => {
    resetEnvCache();
    process.env.AGENT_SESSION_HEADER = "X-Custom-Session";
    resetEnvCache();
    const c = {
      req: {
        header: (name: string) => (name === "X-Custom-Session" ? "hdr-1" : undefined),
      },
    } as unknown as Parameters<typeof resolveExternalSessionId>[0];
    assert.equal(resolveExternalSessionId(c, "user-field"), "hdr-1");
    delete process.env.AGENT_SESSION_HEADER;
    resetEnvCache();
  });
});
