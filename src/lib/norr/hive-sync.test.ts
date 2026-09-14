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
    assert.equal(contactPlan({ website: "https://acme.fi", depth: "normal" }).harvestBudget, 4);
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
    assert.match(src, /type = \$\{"discover"\} and locked_at/);
    assert.doesNotMatch(src, /discovered: 0, timedOut: true/);
    assert.match(src, /when 'discover' then 0/);
    assert.match(src, /finderNeeded/);
    const rec = src.indexOf("if (emailRecovery) return");
    const finderPersist = src.indexOf("websiteSource: \"finder\"");
    assert.ok(finderPersist > 0 && rec > finderPersist);
    assert.match(src, /insert into jobs \(id, user_id, run_id, company_id, type, payload\)/);
    assert.doesNotMatch(src.slice(src.indexOf("async function attachDiscovered"), src.indexOf("export async function runDiscover")), /insertCompany\(/);
    assert.match(src, /discoverSlots/);
    assert.match(src, /skipDiscover = opts\?\.skipDiscover \|\| discoverSlots <= 0/);
    assert.doesNotMatch(src, /emailOnly/);
  });

  it("Face search tick actually drains jobs for the run", () => {
    const tick = readFileSync(new URL("../../routes/api/search/tick.ts", import.meta.url), "utf8");
    assert.match(tick, /searchQueueView/);
    assert.match(tick, /processJobsFor/);
    assert.match(tick, /resumeDiscoverIfStarved/);
    assert.match(tick, /maxMs: 20_000/);
    assert.match(tick, /concurrency: 16/);
    const runPage = readFileSync(new URL("../../routes/_app/search/$runId.tsx", import.meta.url), "utf8");
    assert.match(runPage, /AbortSignal\.timeout\(25000\)/);
    assert.doesNotMatch(runPage, /AbortSignal\.timeout\(4000\)/);
  });
});
