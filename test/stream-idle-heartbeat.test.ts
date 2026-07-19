import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetEnvCache, getEnv } from "../src/config/env.js";
import {
  STREAM_IDLE_HEARTBEAT_CHAR,
  withIdleHeartbeats,
} from "../src/cursor/stream-idle-heartbeat.js";

async function collect(gen: AsyncGenerator<string, void>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of gen) {
    out.push(chunk);
  }
  return out;
}

async function* delayedEvents<T>(items: Array<{ value: T; delayMs: number }>): AsyncGenerator<T> {
  for (const item of items) {
    if (item.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, item.delayMs));
    }
    yield item.value;
  }
}

describe("withIdleHeartbeats", () => {
  it("yields heartbeats during long gaps between events", async () => {
    const events = delayedEvents([
      { value: "hello", delayMs: 0 },
      { value: "world", delayMs: 80 },
    ]);

    const out = await collect(
      withIdleHeartbeats(events, {
        intervalMs: 25,
        onHeartbeat: () => "H",
        onEvent: (v) => v,
      }),
    );

    assert.deepEqual(out.filter((c) => c !== "H"), ["hello", "world"]);
    assert.ok(out.includes("H"), "expected at least one heartbeat during idle gap");
  });

  it("resets idle timer on events that produce no text", async () => {
    type Ev = { kind: "silent" } | { kind: "text"; value: string };

    const events = delayedEvents<Ev>([
      { value: { kind: "silent" }, delayMs: 0 },
      { value: { kind: "text", value: "ok" }, delayMs: 40 },
    ]);

    const out = await collect(
      withIdleHeartbeats(events, {
        intervalMs: 50,
        onHeartbeat: () => "H",
        onEvent: (e) => (e.kind === "text" ? e.value : undefined),
      }),
    );

    assert.deepEqual(out, ["ok"]);
  });

  it("does not yield heartbeats after the stream ends", async () => {
    async function* quick() {
      yield "only";
    }

    const out = await collect(
      withIdleHeartbeats(quick(), {
        intervalMs: 10,
        onHeartbeat: () => "H",
        onEvent: (v) => v,
      }),
    );

    assert.deepEqual(out, ["only"]);
  });

  it("passes through without heartbeats when intervalMs is 0", async () => {
    async function* source() {
      yield "a";
      yield "b";
    }

    const out = await collect(
      withIdleHeartbeats(source(), {
        intervalMs: 0,
        onHeartbeat: () => {
          throw new Error("heartbeat should not run");
        },
        onEvent: (v) => v,
      }),
    );

    assert.deepEqual(out, ["a", "b"]);
  });

  it("uses zero-width space constant for default heartbeat char", () => {
    assert.equal(STREAM_IDLE_HEARTBEAT_CHAR, "\u200b");
  });
});

describe("STREAM_IDLE_HEARTBEAT_SECONDS", () => {
  it("defaults to 30 and accepts 0 to disable", () => {
    resetEnvCache();
    delete process.env.STREAM_IDLE_HEARTBEAT_SECONDS;
    assert.equal(getEnv().streamIdleHeartbeatSeconds, 30);

    resetEnvCache();
    process.env.STREAM_IDLE_HEARTBEAT_SECONDS = "0";
    assert.equal(getEnv().streamIdleHeartbeatSeconds, 0);

    resetEnvCache();
    delete process.env.STREAM_IDLE_HEARTBEAT_SECONDS;
  });
});
