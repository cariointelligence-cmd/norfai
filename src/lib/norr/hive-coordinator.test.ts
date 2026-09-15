import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hivePlan, hiveSkipFinancial, hiveSkipIdentity, hiveSkipSignals, hiveSourceReport, HIVE_ENGINE_ORDER, hiveMeshSize, hiveSelectEngines } from "./hive-coordinator.ts";
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
    assert.ok((report.hive?.catalogSize ?? 0) >= 270_000);
    assert.equal(report.hive?.fanOutAll, false);
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
  it("hive mesh is 270k+ and never fans out", () => {
    assert.ok(hiveMeshSize() >= 270_000);
    const skip = hiveSelectEngines({
      country: "FI",
      industry: "62",
      missing: { email: false, phone: false, people: false },
    });
    assert.equal(skip.skipFleet, true);
    assert.equal(skip.crawlerIds.length, 0);
    const pick = hiveSelectEngines({
      country: "FI",
      industry: "62",
      preset: "website_sales",
      missing: { email: true, phone: true, people: true },
    });
    assert.equal(pick.skipFleet, false);
    assert.ok(pick.crawlerIds.length >= 4 && pick.crawlerIds.length <= 8);
    assert.ok(pick.selected.length >= pick.crawlerIds.length);
    assert.ok(pick.budgetMs <= 2800);
    assert.ok(pick.parallel <= 5);
    assert.ok(pick.crawlerIds.every((id) => id.startsWith("fi_")));
    const se = hiveSelectEngines({
      country: "SE",
      missing: { email: true, phone: false, people: false },
    });
    assert.ok(se.crawlerIds.every((id) => id.startsWith("se_")));
  });
});
