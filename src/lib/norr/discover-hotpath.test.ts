import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("discover hot path", () => {
  it("does not wait on platform identity or schema before YTJ", () => {
    const src = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export async function runDiscover"), src.indexOf("export async function resumeDiscoverIfStarved"));
    assert.doesNotMatch(fn, /ensurePlatformIdentity/);
    assert.doesNotMatch(fn, /ensureOpsSchema/);
    assert.doesNotMatch(fn, /seedSourceHealth/);
    assert.match(fn, /ytjDiscover/);
  });

  it("pump skips schema and does not pin a pooled statement_timeout", () => {
    const src = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export async function pumpSearch"), src.indexOf("export async function kickSearchExecution"));
    assert.match(fn, /skipSchema: true/);
    assert.doesNotMatch(fn, /SET statement_timeout/);
    assert.match(fn, /scheduleBackground|maxMs: 10_000/);
  });
});
