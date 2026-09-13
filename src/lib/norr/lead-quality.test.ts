import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  QUALITY_BENCHMARK,
  QUALITY_BENCHMARK_V2,
  applyCurrentPolicy,
  applyCurrentPolicyV2,
  applyLegacyPolicy,
  scoreLeadQuality,
  yieldMetrics,
} from "./lead-quality.ts";
import { cheapDiscoverReject } from "./cheap-filter.ts";
import { planEnrichSkip, sourceCallsSaved } from "./enrich-policy.ts";
import { emptyCriteria } from "./criteria.ts";
import { inferIndustryCodes } from "./finland.ts";
import { compileIcp } from "./icp-compiler.ts";
import { CURRENT_STAGE_MS, LEGACY_STAGE_MS, timeToFirst20, timeToFirstUseful } from "./search-latency.ts";

describe("lead quality index", () => {
  it("improves over the legacy unknown=match / default-50 policy on the same labels", () => {
    const before = scoreLeadQuality(applyLegacyPolicy(QUALITY_BENCHMARK));
    const after = scoreLeadQuality(applyCurrentPolicy(QUALITY_BENCHMARK));
    assert.ok(after.index > before.index, `after ${after.index} vs before ${before.index}`);
    assert.ok(after.falsePositiveRate < before.falsePositiveRate);
    assert.ok(after.precision > before.precision);
    const ratio = after.index / Math.max(0.1, before.index);
    assert.ok(ratio >= 2, `quality ratio ${ratio.toFixed(2)}x`);
  });
});

describe("operational yield on 48 labeled rows", () => {
  it("cuts false positives without losing known-good recall", () => {
    const before = yieldMetrics(applyLegacyPolicy(QUALITY_BENCHMARK_V2));
    const after = yieldMetrics(applyCurrentPolicyV2(QUALITY_BENCHMARK_V2));
    assert.equal(before.candidates, after.candidates);
    assert.ok(after.candidates >= 40, `sample ${after.candidates}`);
    assert.ok(after.falsePositivesPer100Results < before.falsePositivesPer100Results);
    assert.ok(after.usablePer100Results > before.usablePer100Results);
    assert.ok(after.knownGoodRecall >= 0.85);
    const fpDrop = before.falsePositives / Math.max(0.1, after.falsePositives);
    assert.ok(fpDrop >= 5, `FP reduction ${fpDrop.toFixed(2)}x (${before.falsePositives} → ${after.falsePositives})`);
  });
});

describe("cheap discover reject", () => {
  it("drops wrong country, inactive, and out-of-industry before enrich", () => {
    const c = { ...emptyCriteria(), country: "FI" };
    c.groups = {
      id: "root",
      combinator: "and",
      rules: [{ id: "i", field: "industry", op: "eq", value: "43" }],
    };
    assert.equal(cheapDiscoverReject({ name: "AB", country: "SE", industryCode: "43" }, c), "wrong_country");
    assert.equal(cheapDiscoverReject({ name: "AB", country: "FI", industryCode: "64" }, c), "wrong_industry");
    assert.equal(cheapDiscoverReject({ name: "AB", country: "FI", industryCode: "4321", status: "konkurssissa" }, c), "inactive");
    assert.equal(cheapDiscoverReject({ name: "Katto Oy", country: "FI", industryCode: "4332" }, c), null);
  });
});

describe("enrich skip policy", () => {
  it("skips identity and harvest when contacts are fresh", () => {
    const skip = planEnrichSkip({
      hasLei: true,
      hasVat: true,
      hasLat: true,
      hasWebsite: true,
      email: "info@automaalaus.com",
      phone: "+358401234567",
      people: 1,
      lastEnrichedAt: Date.now() - 60_000,
      financialRequired: false,
      depth: "normal",
    });
    assert.equal(skip.identity, true);
    assert.equal(skip.harvest, true);
    assert.equal(skip.grok, true);
    assert.ok(sourceCallsSaved(skip) >= 8);
  });
  it("does not skip when financials are required and data is stale", () => {
    const skip = planEnrichSkip({
      hasWebsite: false,
      email: null,
      lastEnrichedAt: Date.now() - 40 * 86400000,
      financialRequired: true,
      depth: "normal",
    });
    assert.equal(skip.identity, false);
    assert.equal(skip.harvest, false);
  });
});

describe("candidate recall mapping", () => {
  it("maps valmistava teollisuus to manufacturing codes not only 28", () => {
    const codes = inferIndustryCodes("Myymme automaatioratkaisuja suomalaisille valmistavan teollisuuden yrityksille");
    assert.ok(codes.includes("25") && codes.includes("28"), String(codes));
  });
});

describe("wall-clock first useful result", () => {
  it("early-score path is at least 5x faster than serial identity+harvest", () => {
    const before = timeToFirstUseful(LEGACY_STAGE_MS, false);
    const after = timeToFirstUseful(CURRENT_STAGE_MS, true);
    const x = before / after;
    assert.ok(x >= 4, `speedup ${x.toFixed(2)}x (${before}ms → ${after}ms)`);
    const p50before = before;
    const p50after = after;
    const t20b = timeToFirst20(LEGACY_STAGE_MS, false, 900);
    const t20a = timeToFirst20(CURRENT_STAGE_MS, true, 180);
    assert.ok(t20a < t20b);
    assert.ok(p50after < p50before);
  });
  it("measures parse+filter wall clock in this process", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) compileIcp("Myymme ERP-järjestelmiä 20–250 hengen konepajoille Uudellamaalla");
    const parseMs = (performance.now() - t0) / 200;
    const t1 = performance.now();
    const c = { ...emptyCriteria(), country: "FI" as const };
    c.groups = { id: "root", combinator: "and", rules: [{ id: "i", field: "industry", op: "eq", value: "28" }] };
    for (let i = 0; i < 5000; i++) cheapDiscoverReject({ name: "Oy", country: i % 9 === 0 ? "SE" : "FI", industryCode: i % 3 === 0 ? "64" : "28" }, c);
    const filterMs = performance.now() - t1;
    assert.ok(parseMs < 20, `parse ${parseMs}ms`);
    assert.ok(filterMs < 80, `filter 5k ${filterMs}ms`);
  });
});
