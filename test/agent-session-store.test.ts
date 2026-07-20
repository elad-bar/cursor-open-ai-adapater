import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache } from "../src/config/env.js";
import {
  buildSessionStoreKey,
  evictExpiredSessions,
  getAgentSession,
  resetAgentSessionStoreForTests,
  setAgentSession,
} from "../src/session/agent-session-store.js";

describe("agent-session-store", () => {
  it("stores and retrieves session by api key hash and external id", () => {
    resetEnvCache();
    resetAgentSessionStoreForTests();
    const key = buildSessionStoreKey("cursor_secret", "user-42");
    assert.match(key, /^[a-f0-9]{64}\|user-42$/);

    setAgentSession("cursor_secret", "user-42", "composer-2.5", "agent-abc");
    const hit = getAgentSession("cursor_secret", "user-42", "composer-2.5");
    assert.equal(hit?.agentId, "agent-abc");
  });

  it("invalidates session when model changes", () => {
    resetAgentSessionStoreForTests();
    setAgentSession("k", "s1", "model-a", "agent-1");
    assert.equal(getAgentSession("k", "s1", "model-b"), undefined);
  });

  it("evicts sessions past TTL", () => {
    resetEnvCache();
    process.env.AGENT_SESSION_TTL_SECONDS = "60";
    resetEnvCache();
    resetAgentSessionStoreForTests();
    setAgentSession("k", "s1", "m", "agent-1");
    const entry = getAgentSession("k", "s1", "m");
    assert.ok(entry);
    entry!.lastUsedAt = Date.now() - 61_000;
    evictExpiredSessions();
    assert.equal(getAgentSession("k", "s1", "m"), undefined);
    delete process.env.AGENT_SESSION_TTL_SECONDS;
    resetEnvCache();
  });

  it("respects max entries via LRU eviction", () => {
    resetEnvCache();
    process.env.AGENT_SESSION_MAX_ENTRIES = "2";
    resetEnvCache();
    resetAgentSessionStoreForTests();
    setAgentSession("k", "s1", "m", "a1");
    setAgentSession("k", "s2", "m", "a2");
    setAgentSession("k", "s3", "m", "a3");
    assert.equal(getAgentSession("k", "s1", "m"), undefined);
    assert.equal(getAgentSession("k", "s2", "m")?.agentId, "a2");
    assert.equal(getAgentSession("k", "s3", "m")?.agentId, "a3");
    delete process.env.AGENT_SESSION_MAX_ENTRIES;
    resetEnvCache();
  });
});
