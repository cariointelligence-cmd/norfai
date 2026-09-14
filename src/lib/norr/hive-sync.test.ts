import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactHarvestDone, contactPlan, directoriesNeeded, finderNeeded } from "./contact-plan.ts";
import { hiveJobRank, hivePlan, hiveSkipSignals } from "./hive-coordinator.ts";
import { emptyCriteria, setIndustryCodes } from "./criteria.ts";

describe("hive sync", () => {
  it("stops extra harvest once a public email exists", () => {
    assert.equal(contactHarvestDone({ emails: 1, namedEmails: 1, phones: 0, depth: "normal" }), true);
    assert.equal(contactHarvestDone({ emails: 1, phones: 0, depth: "normal" }), false);
    assert.equal(contactHarvestDone({ emails: 0, phones: 2, depth: "normal" }), false);
    assert.equal(directoriesNeeded({ emails: 1, phones: 1, depth: "normal" }), false);
    assert.equal(finderNeeded({ emails: 0, depth: "normal" }), false);
    assert.equal(contactPlan({ website: "https://acme.fi", depth: "normal" }).harvestBudget, 3);
  });

  it("ranks discover ahead of email so the cap fills first", () => {
    assert.ok(hiveJobRank("discover") < hiveJobRank("email"));
    assert.ok(hiveJobRank("email") < hiveJobRank("enrich"));
    assert.ok(hiveJobRank("enrich") < hiveJobRank("signals"));
    const c = setIndustryCodes(emptyCriteria(), ["73"]);
    const plan = hivePlan({ criteria: c, depth: "normal", country: "FI" });
    assert.equal(hiveSkipSignals(plan), true);
  });

  it("reclaims zombie running jobs and caps in-flight claims", () => {
    const src = readFileSync(new URL("./pipeline.ts", import.meta.url), "utf8");
    assert.match(src, /locked_at is null/);
    assert.match(src, /Number\(live\) >= 8/);
    assert.match(src, /when 'discover' then 0/);
    assert.match(src, /finderNeeded/);
    assert.match(src, /insert into jobs \(id, user_id, run_id, company_id, type, payload\)/);
    assert.doesNotMatch(src.slice(src.indexOf("async function attachDiscovered"), src.indexOf("export async function runDiscover")), /insertCompany\(/);
  });
});
