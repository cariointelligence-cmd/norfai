import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hivePlan, hiveSkipFinancial, hiveSkipIdentity, hiveSkipSignals, hiveSourceReport, HIVE_ENGINE_ORDER } from "./hive-coordinator.ts";
import { cheapDiscoverReject } from "./cheap-filter.ts";

describe("hive coordinator", () => {
  it("runs engines in one shared order", () => {
    assert.deepEqual([...HIVE_ENGINE_ORDER], [
      "planner", "discover", "cheap_qualify", "contacts", "directories", "identity", "financial", "signals", "score",
    ]);
  });
  it("skips identity and financial on a normal FI search without revenue", () => {
    const plan = hivePlan({ criteria: { country: "FI", maxResults: 20 } as never, depth: "normal", country: "FI" });
    assert.equal(hiveSkipIdentity({ depth: "normal" }), true);
    assert.equal(hiveSkipFinancial(plan), true);
    assert.equal(hiveSkipSignals(plan), true);
    assert.equal(plan.engines.email, "required");
    const report = hiveSourceReport(plan);
    assert.equal(report.source, "search_plan");
    assert.ok(Array.isArray(report.reasons));
  });
  it("requires financial when the ICP asks for revenue", () => {
    const plan = hivePlan({
      criteria: { country: "FI", target: { financial: { revenue: { min: 1e6 } } } } as never,
      country: "FI",
    });
    assert.equal(hiveSkipFinancial(plan), false);
  });
  it("cheap-qualify rejects the wrong country before enrich", () => {
    assert.equal(cheapDiscoverReject({ name: "AB", country: "SE", industryCode: "62" }, { country: "FI" } as never), "wrong_country");
    assert.equal(cheapDiscoverReject({ name: "Oy", country: "FI", industryCode: "62010" }, { country: "FI" } as never), null);
  });
});
