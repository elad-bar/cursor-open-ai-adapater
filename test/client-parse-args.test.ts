import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ClientArgsError,
  parseClientArgs,
  validateClientOptions,
} from "../src/client/parse-args.js";

describe("parseClientArgs", () => {
  it("parses model, json, stream, and positional prompt", () => {
    const opts = parseClientArgs([
      "--model",
      "composer-2.5",
      "--json",
      "--stream",
      "hello",
      "world",
    ]);
    assert.equal(opts.model, "composer-2.5");
    assert.equal(opts.json, true);
    assert.equal(opts.stream, true);
    assert.equal(opts.promptFromArgv, "hello world");
  });

  it("parses schema flag", () => {
    const opts = parseClientArgs([
      "--model",
      "composer-2.5",
      "--schema",
      "./schema.json",
      "ping",
    ]);
    assert.equal(opts.model, "composer-2.5");
    assert.equal(opts.schemaPath, "./schema.json");
    assert.equal(opts.promptFromArgv, "ping");
  });
});

describe("validateClientOptions", () => {
  it("requires --model", () => {
    const opts = parseClientArgs(["hello"]);
    assert.throws(
      () => validateClientOptions(opts),
      (err: unknown) =>
        err instanceof ClientArgsError && err.message.includes("Missing --model"),
    );
  });
  it("rejects --json with --schema", () => {
    const opts = parseClientArgs(["--model", "m", "--json", "--schema", "a.json", "x"]);
    assert.throws(
      () => validateClientOptions(opts),
      (err: unknown) =>
        err instanceof ClientArgsError &&
        err.message.includes("Cannot use --json together with --schema"),
    );
  });

  it("rejects positional prompt with --file", () => {
    const opts = parseClientArgs(["--model", "m", "--file", "p.txt", "also positional"]);
    assert.throws(
      () => validateClientOptions(opts),
      (err: unknown) =>
        err instanceof ClientArgsError &&
        err.message.includes("positional prompt or --file"),
    );
  });
});
