import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contactPlan, directoriesNeeded, contactHarvestDone } from "./contact-plan.ts";
import { inferGeneralMailbox } from "./contacts.ts";

describe("contact plan", () => {
  it("skips search engines when a website is already known", () => {
    const p = contactPlan({ website: "https://katto.fi", depth: "normal" });
    assert.equal(p.skipSearch, true);
    assert.equal(p.harvestBudget, 2);
    assert.equal(p.probeGuesses, false);
  });
  it("guesses domains only when the register has no website", () => {
    const p = contactPlan({ website: null, depth: "normal" });
    assert.equal(p.skipSearch, false);
    assert.equal(p.probeGuesses, true);
  });
  it("does not hit Finder/KL/Northdata after a published email", () => {
    assert.equal(directoriesNeeded({ emails: 1, phones: 0, website: "https://x.fi" }), false);
    assert.equal(directoriesNeeded({ emails: 0, phones: 0, website: null }), true);
    assert.equal(directoriesNeeded({ emails: 0, phones: 1, website: "https://x.fi" }), true);
  });
  it("infers a role mailbox on a live company domain", () => {
    const r = inferGeneralMailbox("hasan.fi", []);
    assert.equal(r?.value, "info@hasan.fi");
    assert.equal(r?.classification, "inferred");
  });
  it("stops extra page crawl once a published email exists", () => {
    assert.equal(contactHarvestDone({ emails: 1, phones: 0 }), true);
    assert.equal(contactHarvestDone({ emails: 0, phones: 1 }), false);
    assert.equal(contactHarvestDone({ emails: 1, phones: 0, depth: "deep" }), false);
  });
});
