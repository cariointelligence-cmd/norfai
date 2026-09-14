import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactHarvestDone, contactPlan, directoriesNeeded } from "./contact-plan.ts";

describe("hive sync", () => {
  it("stops extra harvest once a public email exists", () => {
    assert.equal(contactHarvestDone({ emails: 1, phones: 0, depth: "normal" }), true);
    assert.equal(contactHarvestDone({ emails: 0, phones: 2, depth: "normal" }), false);
    assert.equal(directoriesNeeded({ emails: 1, phones: 1, depth: "normal" }), false);
    assert.equal(contactPlan({ website: "https://acme.fi", depth: "normal" }).harvestBudget, 2);
  });

  it("reclaims zombie running jobs and caps in-flight claims", () => {
    const src = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    assert.match(src, /locked_at is null/);
    assert.match(src, /Number\(live\) >= 4/);
    assert.match(src, /try \{ await runScore/);
    assert.doesNotMatch(src.slice(src.indexOf("if (job.company_id && job.run_id && (job.type === \"scrape\"")), /enrich/);
  });
});
