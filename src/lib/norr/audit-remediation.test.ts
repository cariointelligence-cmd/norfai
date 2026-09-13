import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeWebsite } from "./targeting/website.ts";
import { compoundScores, matchTarget, emptyMatch } from "./targeting/scores.ts";
import { buildCompanyIntel } from "./targeting/hydrate.ts";
import { interpretTargetPrompt } from "./targeting/parser.ts";
import { scoreCompany } from "./scoring.ts";
import { emptyCriteria } from "./criteria.ts";
import { parseXbrlFacts } from "./sources/homemade.ts";
import { preferFinancial, deriveEquityRatio, financialGrowthYoY } from "./financials.ts";
import { classifyHiring, hiringScoreWeight, hiringIsActive } from "./hiring-signal.ts";
import { planSources, shouldRun } from "./source-planner.ts";
import { SOURCE_RUNTIME, runtimeFor } from "./source-runtime.ts";
import { exportSearchUnits, searchShouldChargeBeforeInsert, searchRefundReason } from "./quota-ledger.ts";
import { queryCost } from "./security.ts";
import { procurementNameMatch, shouldAttachProcurement } from "./procurement-match.ts";
import { buildSalesBrief } from "./sales-brief.ts";
import { meanReliability, scoreState } from "./evidence.ts";
import { diagnoseTargetQuery } from "./query-diagnostics.ts";
import { shouldAutoMerge } from "./identity.ts";
import { coreCompanyName } from "./dedupe.ts";

describe("P0 fake scores", () => {
  it("does not start website/SEO/digital from 42/30/28", () => {
    const thin = analyzeWebsite({
      url: "http://old.example/",
      html: `<html><head></head><body><table width="600"><font face="Arial">Welcome © 2012</font></table></body></html>`,
    });
    assert.equal(thin.trafficScore, null);
    assert.ok((thin.score ?? 0) < 40);
    assert.ok((thin.seoScore ?? 0) < 20);
    assert.ok((thin.digitalMaturity ?? 0) < 20);
  });

  it("never returns match 50 or 40 without evaluated criteria", () => {
    const match = matchTarget(
      {
        companyAgeYears: null,
        registrationDate: null,
        revenue: null,
        revenueYear: null,
        revenueSource: null,
        profit: null,
        operatingMargin: null,
        equityRatio: null,
        profitable: null,
        balanceBand: null,
        employeeCount: null,
        industryCode: null,
        industryLabel: null,
        specializations: [],
        website: null,
        hiring: { active: false, evidence: [] },
        growth: { band: null, score: null, evidence: [] },
        scores: { commercialOpportunity: null, digitalOpportunity: null, marketingWaste: null, modernizationNeed: null, purchaseCapacity: null, growthReadiness: null },
      },
      {},
    );
    assert.equal(match.score, null);
    assert.equal(match.status, "NOT_EVALUATED");
    assert.equal(emptyMatch().score, null);
  });

  it("does not default source reliability to 50", () => {
    assert.equal(meanReliability([]), null);
    assert.equal(meanReliability([90, 80]), 85);
    assert.equal(scoreState(null, false), "NOT_EVALUATED");
  });
});

describe("P0 revenue filter three-state", () => {
  it("excludes unknown revenue when the user asked for a range without if-published", () => {
    const r = interpretTargetPrompt("Suomalaiset rakennusfirmat joiden liikevaihto on 2–20 miljoonaa");
    assert.equal(r.spec.financial?.revenue?.unknown, "exclude");
    const match = matchTarget(
      {
        companyAgeYears: null,
        registrationDate: null,
        revenue: null,
        revenueYear: null,
        revenueSource: null,
        profit: null,
        operatingMargin: null,
        equityRatio: null,
        profitable: null,
        balanceBand: null,
        employeeCount: null,
        industryCode: "41",
        industryLabel: "Construction",
        specializations: [],
        website: null,
        hiring: { active: false, evidence: [] },
        growth: { band: null, score: null, evidence: [] },
        scores: { commercialOpportunity: null, digitalOpportunity: null, marketingWaste: null, modernizationNeed: null, purchaseCapacity: null, growthReadiness: null },
      },
      r.spec,
    );
    assert.ok(match.missed.some((m) => /Revenue unknown/i.test(m)));
  });

  it("keeps unknown allow only when the user said if published", () => {
    const r = interpretTargetPrompt("revenue €1M–€10M if published");
    assert.equal(r.spec.financial?.revenue?.unknown, "allow");
  });
});

describe("P0 growth is not hiring", () => {
  it("does not set growth band from hiring language", () => {
    const intel = buildCompanyIntel({
      registrationDate: "2010-01-01",
      revenue: null,
      profit: null,
      employeeCount: null,
      industryCode: "62",
      industryLabel: "IT",
      description: null,
      website: null,
      hiring: true,
      hiringLevel: "HIRING_INDICATED",
      expansion: false,
      procurement: false,
      criteria: emptyCriteria(),
    });
    assert.equal(intel.growth.band, null);
    assert.equal(intel.hiring.active, true);
  });

  it("sets financial growth only from comparable periods", () => {
    const intel = buildCompanyIntel({
      registrationDate: "2010-01-01",
      revenue: 2_400_000,
      previousRevenue: 2_000_000,
      profit: 100_000,
      employeeCount: null,
      industryCode: "62",
      industryLabel: "IT",
      description: null,
      website: null,
      hiring: false,
      expansion: false,
      procurement: false,
      criteria: emptyCriteria(),
    });
    assert.ok(intel.growth.band === "growing" || intel.growth.band === "fast_growing");
    assert.ok(intel.growth.evidence.some((e) => /YoY/i.test(e)));
  });
});

describe("P1-11 sources", () => {
  it("plans XBRL when a Finnish business id exists and revenue is missing", () => {
    const plan = planSources({ country: "FI", businessId: "0112038-9", hasOfficialRevenue: false, target: { financial: { revenue: { min: 2_000_000 } } } });
    assert.equal(plan.xbrl, "required");
    assert.equal(shouldRun(plan.xbrl), true);
  });

  it("does not call job boards unless hiring is requested or deep", () => {
    const skip = planSources({ country: "FI", businessId: "0112038-9", depth: "normal" });
    assert.equal(skip.hiringBoards, "skip");
    const need = planSources({ country: "FI", target: { hiring: { active: true } } });
    assert.equal(need.hiringBoards, "required");
  });

  it("marks prh_xbrl and duunitori ACTIVE with call sites", () => {
    assert.equal(runtimeFor("prh_xbrl")?.status, "ACTIVE");
    assert.ok((runtimeFor("prh_xbrl")?.callSites.length ?? 0) > 0);
    assert.equal(runtimeFor("duunitori")?.status, "ACTIVE");
    assert.equal(runtimeFor("score_native")?.status, "RETIRED");
    assert.equal(runtimeFor("traffic_score")?.status, "RETIRED");
    assert.ok(SOURCE_RUNTIME.every((s) => s.status !== undefined));
  });

  it("parses XBRL equity and does not invent a ratio without assets", () => {
    const xml = `<ix:nonFraction name="fi-sme:Revenue">4700000</ix:nonFraction><ix:nonFraction name="fi-sme:OperatingProfit">210000</ix:nonFraction><ix:nonFraction name="fi-sme:Equity">800000</ix:nonFraction><ix:nonFraction name="fi-sme:Assets">2000000</ix:nonFraction>`;
    const facts = parseXbrlFacts(xml);
    assert.equal(facts.revenue, 4_700_000);
    assert.equal(facts.equity, 800_000);
    assert.equal(facts.assets, 2_000_000);
    assert.equal(facts.equityRatio, 0.4);
    const wrapped = parseXbrlFacts(JSON.stringify({ totalResults: 1, financials: [{ name: "fi-sme:Revenue", value: 1200000, endDate: "2024-12-31" }] }));
    assert.equal(wrapped.revenue, 1_200_000);
    assert.equal(wrapped.year, "2024");
    assert.equal(deriveEquityRatio(null, 100), null);
  });
});

describe("financial precedence", () => {
  it("lets official XBRL replace HTML revenue and not the reverse", () => {
    assert.equal(preferFinancial({ source: "website", revenue: 1 }, { source: "prh_xbrl", revenue: 2 }), true);
    assert.equal(preferFinancial({ source: "prh_xbrl", revenue: 2 }, { source: "kauppalehti", revenue: 9 }), false);
    assert.equal(preferFinancial({ source: null, revenue: null }, { source: "website", revenue: 3 }), true);
  });
});

describe("hiring levels", () => {
  it("does not treat website keywords as confirmed hiring", () => {
    assert.equal(classifyHiring({ confirmedListings: 0, indicatedOnSite: true }), "HIRING_INDICATED");
    assert.equal(classifyHiring({ confirmedListings: 2, indicatedOnSite: true }), "HIRING_CONFIRMED");
    assert.ok(hiringScoreWeight("HIRING_CONFIRMED") > hiringScoreWeight("HIRING_INDICATED"));
    assert.equal(hiringIsActive("HIRING_UNKNOWN"), false);
  });
});

describe("commercial opportunity", () => {
  it("does not emit 65 from company age alone", () => {
    const s = compoundScores({
      revenue: null,
      profit: null,
      profitable: null,
      equityRatio: null,
      ageYears: 12,
      website: null,
      hiring: false,
      expansion: false,
      procurement: false,
    });
    assert.equal(s.commercialOpportunity, null);
  });
});

describe("quota fairness", () => {
  it("does not charge search units for export", () => {
    assert.equal(exportSearchUnits(40), 0);
    assert.equal(queryCost("export"), 0);
    assert.equal(queryCost("bulk_export"), 0);
    assert.equal(searchShouldChargeBeforeInsert({ reused: true, cost: 1 }).action, "reuse");
    assert.equal(searchRefundReason({ infrastructureFailed: true, zeroMatches: false })?.action, "refund");
    assert.equal(searchRefundReason({ infrastructureFailed: false, zeroMatches: true })?.action, "commit");
  });
});

describe("procurement identity", () => {
  it("does not attach a weak name match", () => {
    const weak = procurementNameMatch("Norf Oy", "City of Helsinki procurement");
    assert.equal(shouldAttachProcurement(weak), false);
    const strong = procurementNameMatch("Acme Rakennus Oy", "Acme Rakennus Oy");
    assert.equal(shouldAttachProcurement(strong), true);
    assert.ok(strong.confidence >= 90);
  });
});

describe("sales brief honesty", () => {
  it("labels inference separately from facts", () => {
    const brief = buildSalesBrief({
      name: "Acme Oy",
      industryLabel: "Construction",
      municipality: "Tampere",
      hiringLevel: "HIRING_INDICATED",
      intel: buildCompanyIntel({
        registrationDate: "2010-01-01",
        revenue: null,
        profit: null,
        employeeCount: null,
        industryCode: "41",
        industryLabel: "Construction",
        description: null,
        website: null,
        hiring: true,
        hiringLevel: "HIRING_INDICATED",
        expansion: false,
        procurement: false,
        criteria: { ...emptyCriteria(), target: { industry: { codes: ["41"] } } },
      }),
    });
    assert.ok(brief.inferences.length);
    assert.equal(brief.whyNow.length, 0);
    assert.ok(!brief.facts.some((f) => /grows quickly|kasvaa nopeasti/i.test(f)));
  });
});

describe("query diagnostics", () => {
  it("tells the user traffic cannot be verified", () => {
    const r = interpretTargetPrompt("Find Finnish SaaS companies with high website traffic that are hiring");
    assert.ok(r.diagnostics.unsupported.some((s) => /traffic/i.test(s)));
    assert.equal(r.spec.hiring?.active, true);
  });
});

describe("identity preserved", () => {
  it("does not auto-merge on name only", () => {
    assert.equal(
      shouldAutoMerge(
        { id: "1", name: "Acme Oy", country: "FI" },
        { id: "2", name: "Acme Oy", country: "FI" },
      ),
      false,
    );
    assert.ok(coreCompanyName("Acme Rakennus Oy").includes("acme"));
  });
});

describe("scoreCompany no filler credit", () => {
  it("does not award industry points when no industry was requested", () => {
    const s = scoreCompany({
      criteria: emptyCriteria(),
      industryCode: "62",
      municipality: "Tampere",
      country: "FI",
      hasWebsite: false,
      websiteWeak: false,
      employeeCount: null,
      revenue: null,
      hasDecisionMaker: false,
      hasPublishedEmail: false,
      hasPublishedPhone: false,
      hasHiring: false,
      hasProcurement: false,
      hasFunding: false,
      hasExpansion: false,
      hasProjects: false,
      lastVerifiedAt: null,
      sourceReliabilityAvg: null,
      confidenceFloor: 0,
    });
    assert.equal(s.parts.some((p) => p.key === "industry"), false);
    assert.equal(s.parts.some((p) => p.key === "source_reliability"), false);
  });
});

describe("YoY helper", () => {
  it("returns null without two valid periods", () => {
    assert.equal(financialGrowthYoY(100, null), null);
    assert.equal(financialGrowthYoY(120, 100), 0.2);
  });
});

describe("diagnose helper", () => {
  it("lists unsupported marketing-team size", () => {
    const d = diagnoseTargetQuery("no large internal marketing team", {}, ["Internal marketing-team size is not published. Kept as unavailable, not used as a hard filter."]);
    assert.ok(d.unsupported.some((s) => /marketing-team/i.test(s)));
  });
});
