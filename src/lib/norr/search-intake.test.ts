import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileCriteria } from "./filter-dsl.ts";
import { emptyCriteria, setIndustryCodes } from "./criteria.ts";

describe("search intake", () => {
  it("does not run schema, scoped, quota or discover on create", () => {
    const src = readFileSync(new URL("./search-intake.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /scoped\(/);
    assert.doesNotMatch(src, /ensureOpsSchema/);
    assert.doesNotMatch(src, /assertSearchQuota/);
    assert.doesNotMatch(src, /runDiscover/);
    assert.doesNotMatch(src, /processJobsFor/);
  });

  it("accepts marketing/advertising industry without a city", () => {
    const c = setIndustryCodes(emptyCriteria(), ["73"]);
    c.maxResults = 100;
    const v = compileCriteria(c);
    assert.equal(v.ok, true);
  });
});
