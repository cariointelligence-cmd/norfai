import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("startSearch hot path", () => {
  it("returns runId without awaiting discovery or enrichment", () => {
    const src = readFileSync(new URL("./search-intake.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /await runDiscover/);
    assert.doesNotMatch(src, /await processJobsFor/);
    assert.doesNotMatch(src, /await freezeRunRanking/);
    assert.match(src, /dispatchVercelExecution/);
    assert.match(src, /enqueueJob/);
    assert.match(src, /QUEUED/);
  });
});
