import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("startSearch hot path", () => {
  it("returns runId without awaiting discovery or enrichment", () => {
    const src = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    const start = src.indexOf("export const startSearch");
    const next = src.indexOf("export const interpretPrompt");
    assert.ok(start >= 0 && next > start);
    const body = src.slice(start, next);
    assert.doesNotMatch(body, /await runDiscover/);
    assert.doesNotMatch(body, /await processJobsFor/);
    assert.doesNotMatch(body, /await freezeRunRanking/);
    assert.doesNotMatch(body, /await writeSearchHealth/);
    assert.match(body, /dispatchVercelExecution/);
    assert.match(body, /enqueueJob/);
    assert.match(body, /state: "QUEUED"/);
  });
});
