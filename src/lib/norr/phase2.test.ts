import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileIcp, extractEmployeeRange, compileBeginnerAnswers } from "./icp-compiler.ts";
import { interpretTargetPrompt } from "./targeting/parser.ts";
import { parseEsefFacts, esefLookup } from "./sources/filings-xbrl.ts";
import { fuseFinancials, financialEmptyReason, periodsComparable, type FinancialPeriod } from "./financial-fusion.ts";
import { preferFinancial } from "./financials.ts";
import { classifyHiring, classifyHiringCategory, hiringFreshness, whyNowHiring, firstPartyJobListingAttach, hiringFaceLabel } from "./hiring-signal.ts";
import { extractJsonLd } from "./extract.ts";
import { resolveEntityMatch, mayAttachHighImpactSignal } from "./entity-match.ts";
import { diagnoseCoverage } from "./coverage-diagnostics.ts";
import { websiteObservations, websiteOpportunityFromIntel } from "./website-observations.ts";
import { analyzeWebsite } from "./targeting/website.ts";
import { validateSearchIntent, blockingIssue } from "./query-validation.ts";
import { buildSalesBrief, angleIsSafe } from "./sales-brief.ts";
import { classifyRuntimeHealth } from "./source-health-state.ts";
import { offerFamilyFromText, roleRelevance, pickRelevantPerson } from "./role-relevance.ts";
import { planSources } from "./source-planner.ts";
import { procurementNameMatch, shouldAttachProcurement } from "./procurement-match.ts";
import { matchTarget, compoundScores } from "./targeting/scores.ts";
import { emptyCriteria } from "./criteria.ts";
import { parseXbrlFacts, prhXbrlLookup } from "./sources/homemade.ts";
import { runtimeFor } from "./source-runtime.ts";
import { LANDING, SIGNALS } from "../content/landing.ts";
import { NORF_BUILD } from "./build-stamp.ts";
import { startTrace, markStage, endStage } from "./observability.ts";
import { searchesLimitFor, teamSeatCap } from "./platform.ts";
import { eligibleSearchScore, measureEvidenceCompleteness, personalizedEligibleRank, queryAwareContributions } from "./ranking-v2.ts";

function period(partial: Partial<FinancialPeriod> & { source: string; year: string; revenue: number }): FinancialPeriod {
  return {
    profit: null,
    equity: null,
    assets: null,
    liabilities: null,
    equityRatio: null,
    periodEnd: partial.year ?? null,
    periodLengthDays: 365,
    currency: "EUR",
    sourceUrl: null,
    sourceAuthority: partial.source === "prh_xbrl" ? 100 : partial.source === "esef_xbrl" ? 92 : 40,
    observedAt: "2026-01-01T00:00:00Z",
    valueClass: "OBSERVATION",
    confidence: 80,
    ...partial,
  };
}

describe("ICP compiler V2", () => {
  it("derives manufacturing + employees as unsupported + does not treat deal size as revenue", () => {
    const text =
      "Myymme 15 000–60 000 € ERP-projekteja suomalaisille valmistavan teollisuuden yrityksille, yleensä 20–300 työntekijän yrityksille.";
    const icp = compileIcp(text);
    assert.equal(icp.offerFamily, "erp");
    assert.equal(extractEmployeeRange(text)?.min, 20);
    assert.equal(extractEmployeeRange(text)?.max, 300);
    assert.ok(icp.criteriaList.some((c) => c.criterion === "employees" && !c.supported));
    assert.ok(icp.criteriaList.some((c) => c.criterion === "typical_deal_size" && !c.supported));
    assert.equal(icp.spec.financial?.revenue, undefined);
    assert.ok(icp.criteriaList.some((c) => c.criterion === "industry" && c.origin === "AI_DERIVED"));
    assert.ok(icp.criteriaList.some((c) => c.criterion === "country" && c.origin === "USER_EXPLICIT"));
    assert.ok(icp.criteriaList.some((c) => c.criterion === "decision_makers" && /CIO/.test(c.value)));
  });

  it("keeps explicit revenue exclude and labels origin", () => {
    const icp = compileIcp("Suomalaiset rakennusfirmat joiden liikevaihto on 2–20 miljoonaa");
    const rev = icp.criteriaList.find((c) => c.criterion === "revenue");
    assert.ok(rev);
    assert.equal(rev.origin, "USER_EXPLICIT");
    assert.equal(icp.spec.financial?.revenue?.unknown, "exclude");
  });
});

describe("ESEF parser", () => {
  it("reads IFRS revenue and previous period without narrative concepts", () => {
    const raw = {
      facts: {
        a: { value: "1000000", dimensions: { concept: "ifrs-full:Revenue", period: "2024-01-01T00:00:00/2025-01-01T00:00:00", unit: "iso4217:EUR" } },
        b: { value: "800000", dimensions: { concept: "ifrs-full:Revenue", period: "2023-01-01T00:00:00/2024-01-01T00:00:00", unit: "iso4217:EUR" } },
        c: { value: "ignored", dimensions: { concept: "ifrs-full:DisclosureOfRevenueExplanatory", period: "2024-01-01T00:00:00/2025-01-01T00:00:00" } },
        d: { value: "5000000", dimensions: { concept: "ifrs-full:Assets", period: "2025-01-01T00:00:00", unit: "iso4217:EUR" } },
        e: { value: "2000000", dimensions: { concept: "ifrs-full:Equity", period: "2025-01-01T00:00:00", unit: "iso4217:EUR" } },
      },
    };
    const facts = parseEsefFacts(raw);
    assert.equal(facts.revenue, 1_000_000);
    assert.equal(facts.previousRevenue, 800_000);
    assert.equal(facts.assets, 5_000_000);
    assert.equal(facts.equity, 2_000_000);
    assert.notEqual(facts.revenue, "ignored");
  });
});

describe("financial fusion", () => {
  it("keeps official revenue and records a conflict instead of overwriting", () => {
    const fused = fuseFinancials([
      period({ source: "prh_xbrl", year: "2024", revenue: 4_800_000 }),
      period({ source: "kauppalehti", year: "2024", revenue: 1_200_000, sourceAuthority: 40 }),
    ]);
    assert.equal(fused.latest?.revenue, 4_800_000);
    assert.equal(fused.latest?.source, "prh_xbrl");
    assert.equal(fused.conflictState, "CONFLICTING");
    assert.ok(fused.conflictNote);
  });

  it("does not compute growth across incomparable period lengths", () => {
    const a = period({ source: "prh_xbrl", year: "2024", revenue: 2_000_000, periodLengthDays: 365 });
    const b = period({ source: "prh_xbrl", year: "2023", revenue: 1_000_000, periodLengthDays: 90 });
    assert.equal(periodsComparable(a, b).ok, false);
    const fused = fuseFinancials([a, b]);
    assert.equal(fused.revenueGrowth, null);
    assert.ok(fused.growthWarning);
  });

  it("classifies empty filings honestly", () => {
    assert.equal(financialEmptyReason({ httpOk: true, periodsListed: 0, factsParsed: false }), "no_filing");
    assert.equal(financialEmptyReason({ httpOk: false, periodsListed: 0, factsParsed: false }), "source_failed");
  });

  it("lets official facts beat HTML", () => {
    assert.equal(preferFinancial({ source: "prh_xbrl", revenue: 10 }, { source: "website_html", revenue: 99 }), false);
    assert.equal(preferFinancial({ source: "website_html", revenue: 99 }, { source: "prh_xbrl", revenue: 10 }), true);
  });
});

describe("hiring engine", () => {
  it("classifies titles and freshness without treating stale listings as why now", () => {
    assert.equal(classifyHiringCategory("Myyntipäällikkö"), "SALES_HIRING");
    assert.equal(classifyHiringCategory("Fullstack developer"), "TECH_HIRING");
    const stale = new Date(Date.now() - 200 * 86400000).toISOString();
    assert.equal(hiringFreshness(stale), "HISTORICAL");
    assert.equal(whyNowHiring({ level: "HIRING_CONFIRMED", freshness: "HISTORICAL", title: "Myyjä" }), null);
    assert.match(whyNowHiring({ level: "HIRING_CONFIRMED", freshness: "ACTIVE", title: "Myyjä" }) ?? "", /sales/i);
  });

  it("does not confirm hiring from website language", () => {
    assert.equal(classifyHiring({ confirmedListings: 0, indicatedOnSite: true }), "HIRING_INDICATED");
  });

  it("confirms first-party JSON-LD JobPosting and rejects a different employer", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Myyntipäällikkö","datePosted":"2026-09-01","hiringOrganization":{"name":"Solita Oy"},"url":"https://www.solita.fi/careers/myynti"}</script>`;
    const ld = extractJsonLd(html);
    assert.equal(ld.jobPostings[0]?.title, "Myyntipäällikkö");
    assert.equal(
      firstPartyJobListingAttach({
        companyName: "Solita Oy",
        companyWebsite: "https://www.solita.fi",
        pageUrl: "https://www.solita.fi/careers",
        orgName: ld.jobPostings[0]?.hiringOrganization ?? null,
      }).attach,
      true,
    );
    assert.equal(
      firstPartyJobListingAttach({
        companyName: "Solita Oy",
        companyWebsite: "https://www.solita.fi",
        pageUrl: "https://www.solita.fi/careers",
        orgName: "Reaktor Oy",
      }).attach,
      false,
    );
    assert.equal(
      firstPartyJobListingAttach({
        companyName: "Solita Oy",
        companyWebsite: "https://www.solita.fi",
        pageUrl: "https://duunitori.fi/tyopaikat/solita",
        orgName: "Solita Oy",
      }).attach,
      false,
    );
    assert.equal(hiringFaceLabel(["HIRING_SOURCE_FAILED"]), "Source failed");
    assert.equal(hiringFaceLabel([]), "Unknown");
  });
});

describe("entity match V2", () => {
  it("refuses high-impact attach on name-only similarity", () => {
    const m = resolveEntityMatch({
      company: { name: "Aura Oy" },
      source: { name: "Aurora Nordic Solutions" },
    });
    assert.equal(mayAttachHighImpactSignal(m), false);
  });

  it("attaches when business ids match", () => {
    const m = resolveEntityMatch({
      company: { name: "Nokia Oyj", businessId: "0112038-9" },
      source: { name: "Something else", businessId: "0112038-9" },
    });
    assert.equal(m.status, "MATCH");
    assert.equal(mayAttachHighImpactSignal(m), true);
  });
});

describe("procurement name gate", () => {
  it("does not attach a weak name hit", () => {
    const m = procurementNameMatch("Aura Oy", "Aurora Nordic Oy");
    assert.equal(shouldAttachProcurement(m), false);
  });
});

describe("coverage diagnostics", () => {
  it("explains insufficient financial coverage with real counts", () => {
    const d = diagnoseCoverage({
      candidates: 48,
      returned: 0,
      rejectedRevenueUnknown: 31,
      rejectedRevenueRange: 10,
      rejectedIndustry: 7,
      rejectedHiring: 0,
      rejectedOther: 0,
      sourceFailed: false,
      unsupported: [],
    });
    assert.equal(d.code, "INSUFFICIENT_DATA");
    assert.match(d.detail, /31/);
  });
});

describe("website observations", () => {
  it("separates technical facts from sales inference", () => {
    const w = analyzeWebsite({
      url: "http://old.example/",
      html: `<html><head></head><body><table width="600"><font face="Arial">Welcome © 2012</font></table></body></html>`,
    });
    const obs = websiteObservations(w);
    assert.ok(obs.some((o) => o.kind === "TECHNICAL_FACT" && o.id === "https"));
    assert.ok(obs.some((o) => o.kind === "SALES_INFERENCE"));
    const opp = websiteOpportunityFromIntel(w);
    assert.ok(opp.summary);
  });
});

describe("query validation", () => {
  it("blocks contradictory revenue vs tiny headcount", () => {
    const criteria = emptyCriteria();
    criteria.groups.rules.push({ id: "a", field: "employee_min", op: "gte", value: 1 });
    criteria.groups.rules.push({ id: "b", field: "employee_max", op: "lte", value: 3 });
    const issues = validateSearchIntent({
      spec: { financial: { revenue: { min: 100_000_000, unknown: "exclude" } } },
      criteria,
    });
    assert.ok(blockingIssue(issues));
  });
});

describe("sales brief safety", () => {
  it("does not convert hiring into a sales problem", () => {
    const brief = buildSalesBrief({
      name: "Acme Oy",
      hiringLevel: "HIRING_CONFIRMED",
      hiringCategory: "SALES_HIRING",
      hiringFreshness: "ACTIVE",
      hiringTitle: "Myyjä",
    });
    assert.ok(brief.possibleAngle);
    assert.equal(angleIsSafe(brief.possibleAngle ?? ""), true);
    assert.equal(/ongelmia myynnissä|sales problems/i.test(brief.possibleAngle ?? ""), false);
  });
});

describe("source runtime honesty", () => {
  it("does not mark a module ACTIVE just because it exists", () => {
    assert.equal(
      classifyRuntimeHealth({
        moduleExists: true,
        callSiteExists: false,
        credentialsRequired: false,
        credentialsPresent: false,
      }),
      "DISABLED",
    );
    assert.equal(
      classifyRuntimeHealth({
        moduleExists: true,
        callSiteExists: true,
        credentialsRequired: true,
        credentialsPresent: false,
      }),
      "DISABLED",
    );
    assert.equal(runtimeFor("esef_xbrl")?.status, "ACTIVE");
    assert.ok((runtimeFor("esef_xbrl")?.callSites.length ?? 0) > 0);
  });
});

describe("role relevance", () => {
  it("prefers CIO for ERP and marketing for websites", () => {
    assert.equal(offerFamilyFromText("Myymme ERP-projekteja"), "erp");
    assert.equal(roleRelevance({ offer: "erp", title: "Tietohallintojohtaja" }).relevant, true);
    const pick = pickRelevantPerson(
      [
        { fullName: "Maija", title: "Markkinointipäällikkö" },
        { fullName: "Pekka", title: "Tietohallintojohtaja" },
      ],
      "erp",
    );
    assert.equal(pick?.fullName, "Pekka");
  });
});

describe("source planner esef", () => {
  it("plans ESEF when a LEI exists and revenue is requested", () => {
    const plan = planSources({
      country: "FI",
      businessId: "0112038-9",
      lei: "549300A0JPRWG1KI7U06",
      target: { financial: { revenue: { min: 1_000_000, unknown: "exclude" } } },
    });
    assert.equal(plan.xbrl, "required");
    assert.equal(plan.esef, "required");
  });
});

describe("match hiring honesty", () => {
  it("does not treat indicated hiring as a confirmed match", () => {
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
        hiring: { active: true, evidence: ["HIRING_INDICATED"] },
        growth: { band: null, score: null, evidence: [] },
        scores: { commercialOpportunity: null, digitalOpportunity: null, marketingWaste: null, modernizationNeed: null, purchaseCapacity: null, growthReadiness: null },
      },
      { hiring: { active: true } },
    );
    assert.ok(match.missed.length);
    assert.equal(match.matched.some((m) => /confirmed/i.test(m)), false);
  });

  it("does not claim a company is not hiring when the job board failed", () => {
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
        website: { score: 50 } as never,
        hiring: { active: false, evidence: ["HIRING_SOURCE_FAILED"] },
        growth: { band: null, score: null, evidence: [] },
        scores: { commercialOpportunity: null, digitalOpportunity: null, marketingWaste: null, modernizationNeed: null, purchaseCapacity: null, growthReadiness: null },
      },
      { hiring: { active: true } },
    );
    assert.ok(match.missed.some((m) => /could not be verified/i.test(m)));
    assert.ok(match.unknown.some((u) => /unavailable/i.test(u)));
    assert.equal(match.matched.some((m) => /confirmed/i.test(m)), false);
  });
});

describe("parser honesty", () => {
  it("does not use 15–60k project value as company revenue", () => {
    const r = interpretTargetPrompt("Myymme 15 000–60 000 € ERP-projekteja suomalaisille valmistavan teollisuuden yrityksille");
    assert.equal(r.spec.financial?.revenue, undefined);
  });
});

describe("PRH XML parser still works", () => {
  it("parses a numeric JSON fact list", () => {
    const facts = parseXbrlFacts(JSON.stringify({ financials: [{ name: "revenue", value: 2500000, year: "2024" }] }));
    assert.equal(facts.revenue, 2_500_000);
    assert.equal(facts.year, "2024");
  });
});

describe("landing truth", () => {
  it("does not claim dozens of signals or guessed growth", () => {
    assert.equal(/kymmenien muiden/.test(LANDING.heroBody.fi), false);
    assert.match(LANDING.heroBody.fi, /Not found/);
    assert.equal(/12 vuotta vanha/.test(LANDING.problemBody.fi), false);
    const hiring = SIGNALS.find((s) => s.title.fi === "Rekrytointi");
    assert.ok(hiring);
    assert.equal(/kasvavat ja palkkaavat/.test(hiring.body.fi), false);
    const growth = SIGNALS.find((s) => s.title.fi === "Kasvu");
    assert.ok(growth);
    assert.match(growth.body.fi, /Rekrytointi ei ole kasvua/);
  });
});

describe("financial growth vs hiring", () => {
  it("does not set growthReadiness from hiring alone", () => {
    const scores = compoundScores({
      revenue: null,
      profit: null,
      profitable: null,
      equityRatio: null,
      ageYears: 12,
      website: null,
      hiring: true,
      expansion: false,
      procurement: false,
      financialGrowth: null,
    });
    assert.equal(scores.growthReadiness, null);
  });
});

describe("beginner compiler", () => {
  it("turns business answers into the same ICP model", () => {
    const icp = compileBeginnerAnswers({
      sell: "ERP-projekteja",
      buyer: "valmistavan teollisuuden yritykset Suomessa",
      value: "15 000–60 000 €",
      where: "Suomi",
      good: "20–300 työntekijää",
    });
    assert.equal(icp.offerFamily, "erp");
    assert.ok(icp.criteriaList.some((c) => c.origin === "USER_EXPLICIT" || c.origin === "AI_DERIVED"));
  });
});

describe("observability", () => {
  it("records stage latency without secrets", () => {
    const t = startTrace("run1");
    const s = markStage(t, "discover");
    endStage(s, { recordCount: 4 });
    assert.match(t.correlationId, /^norf_/);
    assert.equal(t.stages[0]?.recordCount, 4);
    assert.ok((t.stages[0]?.latencyMs ?? 0) >= 0);
  });
});

describe("workspace quota is not multiplied by seats", () => {
  it("keeps Free at 50 searches regardless of five people", () => {
    assert.equal(searchesLimitFor("free", false), 50);
    assert.equal(teamSeatCap("free", false), 1);
    assert.equal(teamSeatCap("starter", false), 3);
  });
});

describe("build stamp", () => {
  it("is phase 2", () => {
    assert.match(NORF_BUILD, /2026-09-13/);
  });
});

describe("query-aware ranking", () => {
  it("does not use commercial opportunity as match fallback", () => {
    assert.equal(eligibleSearchScore({ matchScore: null, overallConfidence: null }), 0);
    assert.equal(eligibleSearchScore({ matchScore: 70, overallConfidence: 12 }), 70);
  });

  it("weights website issues for a web agency, not for recruitment", () => {
    const web = queryAwareContributions({
      offer: "website",
      hiringConfirmed: false,
      websiteWeak: true,
      hasPublishedContact: false,
      financialGrowth: null,
      purchaseCapacity: null,
    });
    const rec = queryAwareContributions({
      offer: "recruitment",
      hiringConfirmed: true,
      hiringCategory: "SALES_HIRING",
      websiteWeak: true,
      hasPublishedContact: false,
      financialGrowth: null,
      purchaseCapacity: null,
    });
    assert.ok(web.contributions.some((c) => /website/i.test(c)));
    assert.equal(web.contributions.some((c) => /Hiring listings/.test(c)), false);
    assert.ok(rec.contributions.some((c) => /Hiring listings/.test(c)));
  });

  it("does not let a rejected-style zero match outrank an eligible match via signals", () => {
    const weak = personalizedEligibleRank({
      matchScore: 0,
      overallConfidence: null,
      offer: "website",
      hiringConfirmed: true,
      websiteWeak: true,
      hasPublishedContact: true,
      financialGrowth: 0.4,
      purchaseCapacity: 90,
    });
    const strong = personalizedEligibleRank({
      matchScore: 80,
      overallConfidence: 80,
      offer: "website",
      hiringConfirmed: false,
      websiteWeak: false,
      hasPublishedContact: false,
      financialGrowth: null,
      purchaseCapacity: null,
    });
    assert.ok(strong.score > weak.score);
  });

  it("keeps evidence completeness separate from fit", () => {
    const ev = measureEvidenceCompleteness({
      hasIdentity: true,
      hasIndustry: true,
      hasLocation: true,
      hasRevenue: false,
      hasWebsiteMeasured: false,
      hasHiringSignal: false,
      hasPublishedContact: false,
    });
    assert.equal(ev.state, "EVALUATED");
    assert.ok((ev.score ?? 0) < 50);
    assert.ok(ev.missing.includes("Published revenue"));
  });
});

describe("live official sources", { timeout: 90_000 }, () => {
  it("PRH iXBRL for Nokia stays empty, not filled", async () => {
    const r = await prhXbrlLookup("0112038-9");
    if (!r.ok) {
      assert.ok(r.error);
      return;
    }
    assert.equal(r.data.revenue, null);
    assert.equal(r.data.status, "UNAVAILABLE");
    assert.ok(r.data.emptyReason === "no_filing" || r.data.emptyReason === "parser_empty" || r.data.emptyReason === "source_failed");
  });

  it("ESEF for Nokia LEI either verifies a large published revenue or stays empty", async () => {
    const r = await esefLookup("549300A0JPRWG1KI7U06");
    if (!r.ok) {
      assert.ok(r.error);
      assert.doesNotMatch(r.error, /19\d{9}/);
      return;
    }
    if (r.data.status === "VERIFIED") {
      assert.ok(r.data.revenue != null && r.data.revenue > 1_000_000_000);
      assert.ok(r.data.year);
    } else {
      assert.equal(r.data.revenue, null);
    }
  });
});
