import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kvConfigured } from "./kv-cache.ts";

describe("Vercel KV optional", () => {
  it("is off without marketplace env", () => {
    assert.equal(kvConfigured(), false);
  });
});
