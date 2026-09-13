import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretTargetPrompt, applyPresetToCriteria } from "./parser.ts";
import { analyzeWebsite, extractFinancialMentions, detectPixels } from "./website.ts";
import { companyAgeYears, classifyBalance, compoundScores, matchTarget, emptyMatch } from "./scores.ts";
import { inferSpecializations, specializationLabel } from "./industry.ts";
import { emptyCriteria } from "../criteria.ts";
import { OPPORTUNITY_PRESETS } from "./spec.ts";
import { shouldRejectForTarget } from "./filter.ts";
import { inferIndustryCodes } from "../finland.ts";
import { detectHiring } from "../extract.ts";
import { parseXbrlFacts } from "../sources/homemade.ts";

describe("AI target builder", () => {
  it("parses a Finnish website-prospect prompt into a structured spec", () => {
    const r = interpretTargetPrompt(
      "Find Finnish construction companies in Tampere with outdated websites, revenue €1M–€10M if published, profitable if known, and Meta advertising tags.",
    );
    assert.equal(r.criteria.country, "FI");
    assert.equal(r.spec.financial?.revenue?.min, 1_000_000);
    assert.equal(r.spec.financial?.revenue?.max, 10_000_000);
    assert.equal(r.spec.financial?.revenue?.unknown, "allow");
    assert.equal(r.spec.financial?.profitable, true);
    assert.equal(r.spec.website?.highOpportunity, true);
    assert.ok((r.spec.website?.qualityScore?.max ?? 99) <= 48);
    assert.equal(r.spec.advertising?.meta, "ACTIVE_OR_RECENT");
    assert.ok(r.spec.industry?.codes?.includes("41"));
    assert.ok(r.summary.some((s) => /Tampere/i.test(s)));
    assert.ok(r.summary.some((s) => /not claimed spend/i.test(s)));
  });

  it("parses hyphen and 'to' euro ranges the same way", () => {
    const a = interpretTargetPrompt("revenue €2M-€20M");
    const b = interpretTargetPrompt("revenue 2m to 20m euro");
    assert.equal(a.spec.financial?.revenue?.min, 2_000_000);
    assert.equal(a.spec.financial?.revenue?.max, 20_000_000);
    assert.equal(b.spec.financial?.revenue?.min, 2_000_000);
    assert.equal(b.spec.financial?.revenue?.max, 20_000_000);
  });

  it("maps a website-sales sentence onto the website_sales preset", () => {
    const r = interpretTargetPrompt("I sell premium websites. Find companies I could sell a €5,000 website project to.");
    assert.equal(r.criteria.preset, "website_sales");
    assert.equal(r.spec.website?.highOpportunity, true);
  });

  it("maps a marketing prompt to advertising, not health or electricity", () => {
    const r = interpretTargetPrompt("Find Finnish marketing companies in Tampere");
    assert.ok(r.spec.industry?.codes?.includes("73"));
    assert.equal(r.spec.industry?.codes?.includes("86"), false);
    assert.equal(r.spec.industry?.codes?.includes("35"), false);
    const rules = r.criteria.groups.rules.filter((x) => !("rules" in x) && x.field === "industry");
    assert.ok(rules.some((x) => !("rules" in x) && x.value === "73"));
  });

  it("reads company age and no-chatbot without claiming unpublished finance", () => {
    const r = interpretTargetPrompt("Find companies founded more than 10 years ago with no obvious chatbot");
    assert.equal(r.spec.company?.ageYears?.min, 10);
    assert.equal(r.spec.tech?.hasChat, false);
    assert.equal(r.spec.financial?.revenue, undefined);
  });

  it("parses a commercial industrial query without inventing a marketing team", () => {
    const r = interpretTargetPrompt(
      "Find Finnish industrial companies with €2–20 million revenue, positive operating profit, weak websites, recent recruitment activity, no large internal marketing team and a likely need for a website renewal.",
    );
    assert.equal(r.criteria.country, "FI");
    assert.equal(r.spec.financial?.revenue?.min, 2_000_000);
    assert.equal(r.spec.financial?.revenue?.max, 20_000_000);
    assert.equal(r.spec.financial?.profitable, true);
    assert.equal(r.spec.hiring?.active, true);
    assert.equal(r.spec.website?.highOpportunity, true);
    assert.ok((r.spec.website?.qualityScore?.max ?? 99) <= 48);
    assert.equal(r.criteria.preset, "website_sales");
    assert.ok(inferIndustryCodes("Finnish industrial companies").some((c) => ["10", "25", "28"].includes(c)));
    assert.ok(r.spec.industry?.codes?.some((c) => ["10", "25", "28"].includes(c)));
    assert.ok(r.summary.some((s) => /marketing-team size is not published/i.test(s)));
    assert.equal(r.summary.some((s) => /hard filter/i.test(s) && /marketing/i.test(s)), true);
  });
});

describe("opportunity presets", () => {
  it("applies website_sales without requiring unpublished revenue", () => {
    const c = applyPresetToCriteria(emptyCriteria(), "website_sales");
    assert.equal(c.mode, "opportunity");
    assert.equal(c.preset, "website_sales");
    assert.equal(c.target?.financial?.revenue?.unknown, "allow");
    assert.equal(c.target?.website?.highOpportunity, true);
    assert.equal(OPPORTUNITY_PRESETS.marketing_sales.target.advertising?.meta, "ACTIVE_OR_RECENT");
  });
});

describe("website quality engine", () => {
  it("scores a modern HTTPS page with metadata above a table-layout shell", () => {
    const modern = analyzeWebsite({
      url: "https://example.com/",
      html: `<html><head><title>Example industrial automation</title>
        <meta name="viewport" content="width=device-width">
        <meta name="description" content="Industrial automation and PLC systems for factories across Finland.">
        <link rel="canonical" href="https://example.com/">
        <meta property="og:title" content="Example">
        <script type="application/ld+json">{"@type":"Organization"}</script>
        <script src="/_next/static/chunks/main.js"></script>
        </head><body><h1>Automation</h1>
        <form><input name="email"></form>
        <a href="mailto:info@example.com">contact</a>
        <p>${"Service pages and project references. ".repeat(40)}</p>
        </body></html>`,
    });
    const stale = analyzeWebsite({
      url: "http://old.example/",
      html: `<html><head></head><body><table width="600"><font face="Arial">Welcome © 2012</font></table></body></html>`,
    });
    assert.ok((modern.score ?? 0) > (stale.score ?? 0));
    assert.ok((modern.seoScore ?? 0) > (stale.seoScore ?? 0));
    assert.equal(stale.https, false);
    assert.equal(stale.copyrightYear, 2012);
    assert.ok(stale.estimatedGeneration === "2010–2016" || stale.estimatedGeneration === "2005–2012");
    assert.ok(stale.likelyWeak);
    assert.ok((stale.score ?? 0) < 40);
  });

  it("labels Meta pixels as LIKELY and never invents spend", () => {
    const html = `<script>!function(f,b,e,v,n,t,s){fbq('init','123')}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');</script>`;
    const intel = analyzeWebsite({ url: "https://ads.example/", html: `<html><head><title>Shop</title></head><body>${html}</body></html>` });
    assert.ok(detectPixels(html).includes("meta"));
    assert.equal(intel.adPlatforms.meta, "LIKELY");
    assert.notEqual(intel.adPlatforms.meta, "DETECTED");
    const blob = JSON.stringify(intel);
    assert.equal(/€\s*\d|spend|monthly/i.test(blob), false);
  });

  it("does not claim advertising on a page without tags", () => {
    const intel = analyzeWebsite({ url: "https://plain.example/", html: "<html><head><title>Hi</title></head><body><p>Hello</p></body></html>" });
    assert.equal(intel.adPlatforms.meta, "NOT_DETECTED");
    assert.equal(intel.adActivityScore, null);
    assert.equal(intel.adIntensity, null);
  });

  it("extracts published liikevaihto from website text only", () => {
    const r = extractFinancialMentions("Yrityksen liikevaihto 4,7 miljoonaa euroa vuonna 2024.");
    assert.equal(r.revenue, 4_700_000);
    assert.ok(r.evidence.length);
    const none = extractFinancialMentions("We are a growing company.");
    assert.equal(none.revenue, null);
    assert.equal(none.profit, null);
  });
});

describe("company age and matching", () => {
  it("computes whole years from a registration date", () => {
    const age = companyAgeYears("2004-03-01", new Date("2026-09-08T00:00:00Z"));
    assert.equal(age, 22);
    assert.equal(companyAgeYears(null), null);
    assert.equal(companyAgeYears("not-a-date"), null);
  });

  it("does not invent a balance band without evidence", () => {
    assert.equal(classifyBalance({ equityRatio: null, profitable: null }), null);
    assert.equal(classifyBalance({ equityRatio: 0.54, profitable: true }), "very_strong");
  });

  it("leaves compound scores null when no signals exist", () => {
    const s = compoundScores({
      revenue: null,
      profit: null,
      profitable: null,
      equityRatio: null,
      ageYears: null,
      website: null,
      hiring: false,
      expansion: false,
      procurement: false,
    });
    assert.equal(s.commercialOpportunity, null);
    assert.equal(s.purchaseCapacity, null);
    assert.equal(s.marketingWaste, null);
  });

  it("explains a match and keeps unpublished revenue unknown instead of failing it", () => {
    const intel = {
      companyAgeYears: 17,
      registrationDate: "2009-01-01",
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
      specializations: [] as string[],
      website: analyzeWebsite({
        url: "https://example.fi/",
        html: `<html><head><title>X</title><meta name="viewport" content="width=device-width"></head><body><h1>Hi</h1><script src="https://connect.facebook.net/en_US/fbevents.js"></script></body></html>`,
      }),
      hiring: { active: false, evidence: [] as string[] },
      growth: { band: null, score: null, evidence: [] as string[] },
      scores: { commercialOpportunity: 40, digitalOpportunity: 50, marketingWaste: null, modernizationNeed: 40, purchaseCapacity: null, growthReadiness: 30 },
    };
    const match = matchTarget(intel, {
      financial: { revenue: { min: 1_000_000, max: 10_000_000, unknown: "allow" } },
      website: { qualityScore: { max: 90, unknown: "allow" } },
      advertising: { meta: "ACTIVE_OR_RECENT" },
      company: { ageYears: { min: 10, unknown: "allow" } },
    });
    assert.ok(match.matched.some((m) => /Company age/i.test(m)));
    assert.ok(match.matched.some((m) => /Meta advertising infrastructure/i.test(m)));
    assert.ok(match.unknown.some((u) => /Revenue/i.test(u)));
    assert.equal(match.missed.some((m) => /Revenue/i.test(m)), false);
    assert.ok(match.score >= 50);
  });

  it("requires published revenue when the policy says require", () => {
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
      { financial: { revenue: { min: 1_000_000, unknown: "require" } } },
    );
    assert.ok(match.missed.some((m) => /Revenue unknown/i.test(m)));
  });

  it("starts from an empty match with no numeric filler", () => {
    assert.equal(emptyMatch().score, null);
    assert.equal(emptyMatch().status, "NOT_EVALUATED");
  });

  it("does not reject hiring until a page was actually crawled", () => {
    const base = {
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
      industryCode: "28",
      industryLabel: "Machinery",
      specializations: [] as string[],
      website: null,
      hiring: { active: false, evidence: [] as string[] },
      growth: { band: null, score: null, evidence: [] as string[] },
      scores: { commercialOpportunity: null, digitalOpportunity: null, marketingWaste: null, modernizationNeed: null, purchaseCapacity: null, growthReadiness: null },
    };
    const pending = matchTarget(base, { hiring: { active: true } });
    assert.ok(pending.unknown.some((u) => /Hiring not measured/i.test(u)));
    assert.equal(pending.missed.length, 0);
    const crawled = matchTarget(
      { ...base, website: analyzeWebsite({ url: "https://plain.example/", html: "<html><head><title>Hi</title></head><body><p>Hello</p></body></html>" }) },
      { hiring: { active: true } },
    );
    assert.ok(crawled.missed.some((m) => /No hiring signal/i.test(m)));
    const intel = { ...base, match: crawled };
    assert.ok(shouldRejectForTarget(intel, { ...emptyCriteria(), target: { hiring: { active: true } } }));
  });
});

describe("hiring and filings", () => {
  it("detects Finnish and English hiring language", () => {
    assert.equal(detectHiring("We are hiring a salesperson"), true);
    assert.equal(detectHiring("Haemme tuotantopäällikköä. Avoimet työpaikat."), true);
    assert.equal(detectHiring("Join our team in Tampere"), true);
    assert.equal(detectHiring("Welcome to our factory"), false);
  });

  it("parses PRH iXBRL facts and leaves empty filings unavailable", () => {
    const xml = `<ix:nonFraction name="fi-sme:Revenue" unitRef="EUR">4700000</ix:nonFraction><ix:nonFraction name="fi-sme:OperatingProfit" unitRef="EUR">210000</ix:nonFraction>`;
    const facts = parseXbrlFacts(xml);
    assert.equal(facts.revenue, 4_700_000);
    assert.equal(facts.profit, 210_000);
    const empty = parseXbrlFacts("[]");
    assert.equal(empty.revenue, null);
    assert.equal(empty.profit, null);
  });
});

describe("industry intelligence", () => {
  it("infers roofing from website language rather than inventing it", () => {
    const hits = inferSpecializations("Kattourakointi ja bitumikate julkisivun ohella", "43");
    assert.ok(hits.includes("roofing"));
    assert.equal(specializationLabel("roofing"), "Roofing contractor");
    assert.deepEqual(inferSpecializations("Hello world", "62"), []);
  });
});
