import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { resetEnvCache } from "../src/api/config/env.js";
import { requireCursorApiKey } from "../src/api/auth/cursor-api-key.js";

describe("requireCursorApiKey", () => {
  it("accepts Bearer token", async () => {
    const app = new Hono();
    app.get("/t", (c) => {
      const key = requireCursorApiKey(c);
      if (key instanceof Response) return key;
      return c.text(key);
    });

    const res = await app.request("/t", {
      headers: { Authorization: "Bearer cursor_test_key" },
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "cursor_test_key");
  });

  it("returns 401 without credentials", async () => {
    const prev = process.env.CURSOR_API_KEY;
    delete process.env.CURSOR_API_KEY;
    resetEnvCache();

    const app = new Hono();
    app.get("/t", (c) => {
      const key = requireCursorApiKey(c);
      if (key instanceof Response) return key;
      return c.text(key);
    });

    const res = await app.request("/t");
    assert.equal(res.status, 401);

    if (prev !== undefined) process.env.CURSOR_API_KEY = prev;
    resetEnvCache();
  });
});
