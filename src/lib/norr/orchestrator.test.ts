import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planSearch, eligibleMatch, emptyEmailExportValue } from "./search-orchestrator.ts";
import { emailBelongsToCompany } from "./contacts.ts";
import { ENGINE_STATUSES } from "./engine-contract.ts";

describe("search orchestrator v2", () => {
  it("requires financial engine only when revenue is a criterion", () => {
    const skip = planSearch({ criteria: { country: "FI" } as never });
    assert.equal(skip.engines.financial, "skip");
    assert.equal(skip.engines.email, "required");
    const need = planSearch({ target: { financial: { revenue: { min: 1_000_000, max: 10_000_000 } } } as never });
    assert.equal(need.engines.financial, "required");
    assert.ok(need.mandatory.includes("financial"));
  });
  it("does not treat not-rejected as a match", () => {
    assert.equal(eligibleMatch({ name: "Oy", matchScore: 0, recordStatus: "discovered" }), false);
    assert.equal(eligibleMatch({ name: "Oy", matchScore: 12, recordStatus: "enriched" }), true);
    assert.equal(eligibleMatch({ name: "Oy", matchScore: 90, recordStatus: "rejected" }), false);
  });
  it("exports UNKNOWN instead of a blank email cell", () => {
    assert.equal(emptyEmailExportValue(null, null), "UNKNOWN");
    assert.equal(emptyEmailExportValue("published", "info@x.fi"), "info@x.fi");
  });
  it("keeps engine statuses distinct — NO_DATA is not FAILED", () => {
    assert.ok(ENGINE_STATUSES.includes("NO_DATA"));
    assert.ok(ENGINE_STATUSES.includes("FAILED"));
  });
});

describe("brand-domain email identity", () => {
  it("accepts a brand mailbox when the legal website is a different owned host", () => {
    assert.equal(
      emailBelongsToCompany("hello@hasan.fi", { name: "Hasan & Partners Oy", website: "https://hasanpartners.com" }),
      true,
    );
  });
  it("still rejects billing and consumer mailboxes", () => {
    assert.equal(emailBelongsToCompany("lasku@hasan.fi", { name: "Hasan Oy", website: "https://hasan.fi" }), false);
  });
});
