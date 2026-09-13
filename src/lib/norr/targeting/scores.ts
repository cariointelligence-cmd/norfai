import type { TargetSpec, BalanceBand, GrowthBand } from "./spec.ts";
import type { WebsiteIntel } from "./website.ts";
import { specializationLabel } from "./industry.ts";

export type CompanyIntel = {
  companyAgeYears: number | null;
  registrationDate: string | null;
  revenue: number | null;
  revenueYear: string | null;
  revenueSource: string | null;
  profit: number | null;
  operatingMargin: number | null;
  equityRatio: number | null;
  profitable: boolean | null;
  balanceBand: BalanceBand | null;
  employeeCount: number | null;
  industryCode: string | null;
  industryLabel: string | null;
  specializations: string[];
  website: WebsiteIntel | null;
  hiring: { active: boolean; evidence: string[] };
  growth: { band: GrowthBand | null; score: number | null; evidence: string[] };
  scores: {
    commercialOpportunity: number | null;
    digitalOpportunity: number | null;
    marketingWaste: number | null;
    modernizationNeed: number | null;
    purchaseCapacity: number | null;
    growthReadiness: number | null;
  };
  match: {
    score: number | null;
    status: "NOT_EVALUATED" | "INSUFFICIENT_DATA" | "EVALUATED";
    matched: string[];
    missed: string[];
    unknown: string[];
    why: string[];
    consideredFields: string[];
    matchedFields: string[];
    missingFields: string[];
    conflictingFields: string[];
    confidence: number | null;
    explanation: string;
  };
  evidenceCompleteness?: {
    score: number | null;
    present: string[];
    missing: string[];
    state: "NOT_EVALUATED" | "EVALUATED";
  };
  personalized?: {
    score: number | null;
    offer: string;
    contributions: string[];
  };
};

export function companyAgeYears(registrationDate: string | null | undefined, now = new Date()): number | null {
  if (!registrationDate || !/^\d{4}/.test(registrationDate)) return null;
  const d = new Date(registrationDate.slice(0, 10));
  if (Number.isNaN(d.getTime())) {
    const y = Number(registrationDate.slice(0, 4));
    if (!y) return null;
    return Math.max(0, now.getFullYear() - y);
  }
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (365.25 * 86400000));
}

export function classifyBalance(opts: { equityRatio: number | null; profitable: boolean | null }): BalanceBand | null {
  if (opts.equityRatio == null && opts.profitable == null) return null;
  if (opts.equityRatio != null) {
    if (opts.equityRatio >= 0.5) return "very_strong";
    if (opts.equityRatio >= 0.35) return "strong";
    if (opts.equityRatio >= 0.2) return "normal";
    if (opts.equityRatio >= 0.1) return "weak";
    return "high_risk";
  }
  if (opts.profitable === false) return "weak";
  if (opts.profitable === true) return "normal";
  return null;
}

function avg(nums: Array<number | null | undefined>): number | null {
  const v = nums.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

export function compoundScores(input: {
  revenue: number | null;
  profit: number | null;
  profitable: boolean | null;
  equityRatio: number | null;
  ageYears: number | null;
  website: WebsiteIntel | null;
  hiring: boolean;
  expansion: boolean;
  procurement: boolean;
  financialGrowth?: number | null;
}): CompanyIntel["scores"] {
  const w = input.website;
  const webOpp = w?.opportunityScore ?? null;
  const webScore = w?.score ?? null;
  const seo = w?.seoScore ?? null;
  const digital = w?.digitalMaturity ?? null;
  const ads = w?.adActivityScore ?? null;

  const purchaseBits: number[] = [];
  if (input.revenue != null) purchaseBits.push(input.revenue >= 5_000_000 ? 90 : input.revenue >= 1_000_000 ? 70 : input.revenue >= 500_000 ? 50 : 25);
  if (input.profitable === true) purchaseBits.push(80);
  if (input.profitable === false) purchaseBits.push(20);
  if (input.equityRatio != null) purchaseBits.push(Math.round(Math.min(1, Math.max(0, input.equityRatio)) * 100));
  const purchaseCapacity = purchaseBits.length ? Math.round(purchaseBits.reduce((a, b) => a + b, 0) / purchaseBits.length) : null;

  const digitalOpportunity = avg([webOpp, digital != null ? 100 - digital : null, seo != null ? Math.max(0, 80 - seo) : null]);
  const marketingWaste = ads && webScore != null ? Math.round(ads * 0.45 + (100 - webScore) * 0.55) : ads && webScore == null ? null : null;
  const modernizationNeed = avg([
    webScore != null ? 100 - webScore : null,
    w?.hasViewport === false ? 80 : null,
    w?.https === false ? 90 : null,
    (w?.tech.includes("jquery") && !w.frameworks.length) ? 70 : null,
  ]);

  const growthReadiness = input.financialGrowth == null
    ? null
    : input.financialGrowth >= 0.2
      ? 85
      : input.financialGrowth > 0.02
        ? 65
        : input.financialGrowth > -0.02
          ? 45
          : 25;

  const commercialBits: number[] = [];
  if (purchaseCapacity != null) commercialBits.push(purchaseCapacity);
  if (webOpp != null) commercialBits.push(webOpp);
  if (digital != null) commercialBits.push(Math.max(0, 90 - digital));
  if (input.hiring) commercialBits.push(70);
  if (ads) commercialBits.push(Math.min(90, ads));
  if (commercialBits.length && input.ageYears != null && input.ageYears >= 5) {
    commercialBits.push(25);
  }
  const commercialOpportunity = commercialBits.length ? Math.round(commercialBits.reduce((a, b) => a + b, 0) / commercialBits.length) : null;

  return {
    commercialOpportunity,
    digitalOpportunity,
    marketingWaste,
    modernizationNeed,
    purchaseCapacity,
    growthReadiness,
  };
}

export function emptyMatch(): CompanyIntel["match"] {
  return {
    score: null,
    status: "NOT_EVALUATED",
    matched: [],
    missed: [],
    unknown: [],
    why: [],
    consideredFields: [],
    matchedFields: [],
    missingFields: [],
    conflictingFields: [],
    confidence: null,
    explanation: "Ei riittävästi tietoa pisteytykseen",
  };
}

function rangeCheck(
  label: string,
  value: number | null,
  range: { min?: number | null; max?: number | null; unknown?: string } | undefined,
  match: CompanyIntel["match"],
  opts?: { defaultUnknown?: "allow" | "exclude" | "require" },
): void {
  if (!range || (range.min == null && range.max == null)) return;
  const policy = range.unknown ?? opts?.defaultUnknown ?? "exclude";
  if (value == null) {
    if (policy === "require" || policy === "exclude") {
      match.missed.push(`${label} unknown (required)`);
      match.missingFields.push(label);
    } else {
      match.unknown.push(`${label} not published`);
    }
    return;
  }
  const minOk = range.min == null || value >= range.min;
  const maxOk = range.max == null || value <= range.max;
  if (minOk && maxOk) {
    match.matched.push(`${label} ${formatNum(value)} fits`);
    match.matchedFields.push(label);
    match.consideredFields.push(label);
  } else {
    match.missed.push(`${label} ${formatNum(value)} outside range`);
    match.conflictingFields.push(label);
    match.consideredFields.push(label);
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `€${Math.round(n / 1000)}k`;
  if (n > 0 && n < 1) return `${Math.round(n * 100)}%`;
  return String(n);
}

export function matchTarget(intel: Omit<CompanyIntel, "match">, spec: TargetSpec | undefined): CompanyIntel["match"] {
  const match = emptyMatch();
  if (!spec || JSON.stringify(spec) === "{}") {
    match.status = "NOT_EVALUATED";
    match.score = null;
    match.explanation = "Ei riittävästi tietoa pisteytykseen";
    match.why.push("No targeting spec. Match is not scored without evaluated criteria.");
    return match;
  }

  rangeCheck("Revenue", intel.revenue, spec.financial?.revenue, match, { defaultUnknown: "exclude" });
  rangeCheck("Profit", intel.profit, spec.financial?.profit, match, { defaultUnknown: "exclude" });
  rangeCheck("Operating margin", intel.operatingMargin, spec.financial?.operatingMargin, match, { defaultUnknown: "exclude" });
  rangeCheck("Equity ratio", intel.equityRatio, spec.financial?.equityRatio, match, { defaultUnknown: "exclude" });
  if (spec.financial?.profitable === true) {
    if (intel.profitable === true) { match.matched.push("Published as profitable"); match.matchedFields.push("Profitability"); match.consideredFields.push("Profitability"); }
    else if (intel.profitable === false) { match.missed.push("Published result is not profitable"); match.conflictingFields.push("Profitability"); match.consideredFields.push("Profitability"); }
    else match.unknown.push("Profitability not published");
  }
  if (spec.financial?.profitable === false) {
    if (intel.profitable === false) { match.matched.push("Published negative result"); match.matchedFields.push("Profitability"); match.consideredFields.push("Profitability"); }
    else if (intel.profitable === true) { match.missed.push("Published as profitable"); match.conflictingFields.push("Profitability"); match.consideredFields.push("Profitability"); }
    else match.unknown.push("Profitability not published");
  }

  rangeCheck("Company age (years)", intel.companyAgeYears, spec.company?.ageYears, match, { defaultUnknown: "allow" });

  rangeCheck("Website quality", intel.website?.score ?? null, spec.website?.qualityScore, match, { defaultUnknown: "allow" });
  rangeCheck("Website opportunity", intel.website?.opportunityScore ?? null, spec.website?.opportunityScore, match, { defaultUnknown: "allow" });
  rangeCheck("SEO", intel.website?.seoScore ?? null, spec.website?.seoScore, match, { defaultUnknown: "allow" });
  rangeCheck("Digital maturity", intel.website?.digitalMaturity ?? null, spec.website?.digitalMaturity, match, { defaultUnknown: "allow" });
  if (spec.website?.highOpportunity) {
    const opp = intel.website?.opportunityScore;
    if (opp == null) match.unknown.push("Website opportunity not measured (no crawl yet)");
    else if (opp >= 55) match.matched.push(`Website opportunity ${opp}/100`);
    else match.missed.push(`Website opportunity ${opp}/100 is modest`);
  }
  if (spec.website?.qualityBand?.length && intel.website?.band) {
    if (spec.website.qualityBand.includes(intel.website.band)) match.matched.push(`Website band ${intel.website.band}`);
    else match.missed.push(`Website band ${intel.website.band}`);
  }

  if (spec.advertising?.meta) {
    const meta = intel.website?.adPlatforms.meta ?? "UNKNOWN";
    const want = spec.advertising.meta;
    const likely = meta === "LIKELY" || meta === "DETECTED";
    if (want === "ACTIVE" || want === "ACTIVE_OR_RECENT" || want === "RECENT") {
      if (likely) match.matched.push("Meta advertising infrastructure on the public site (not verified spend)");
      else if (meta === "NOT_DETECTED") match.missed.push("No Meta pixel/tag on the crawled site");
      else match.unknown.push("Meta advertising unknown");
    } else if (want === "NONE") {
      if (meta === "NOT_DETECTED") match.matched.push("No Meta pixel detected");
      else if (likely) match.missed.push("Meta pixel is present");
    }
  }
  rangeCheck("Ad activity", intel.website?.adActivityScore ?? null, spec.advertising?.activityScore, match);

  if (spec.tech?.hasChat === false) {
    if (!intel.website) match.unknown.push("Chat widget unknown");
    else if (!intel.website.hasChat) match.matched.push("No public chatbot");
    else match.missed.push("Chat widget present");
  }
  if (spec.tech?.hasChat === true) {
    if (intel.website?.hasChat) match.matched.push("Chat widget present");
    else if (intel.website) match.missed.push("No public chatbot");
  }
  if (spec.tech?.hasEcommerce === true) {
    if (intel.website?.ecommerce) match.matched.push("Ecommerce markers on site");
    else if (intel.website) match.missed.push("No ecommerce markers");
  }
  if (spec.tech?.cms?.length && intel.website) {
    const hit = spec.tech.cms.some((c) => intel.website!.cms.includes(c) || intel.website!.tech.includes(c));
    if (hit) match.matched.push(`CMS ${intel.website.cms.join(", ") || intel.website.tech.join(", ")}`);
    else match.missed.push(`CMS ${intel.website.cms.join(", ") || "not detected"}`);
  }

  if (spec.hiring?.active === true) {
    const confirmed = intel.hiring.evidence.some((e) => e === "HIRING_CONFIRMED");
    if (confirmed) {
      match.matched.push("Hiring confirmed via public job listing");
      match.matchedFields.push("Hiring");
      match.consideredFields.push("Hiring");
    } else if (intel.hiring.evidence.includes("HIRING_SOURCE_FAILED")) {
      match.missed.push("Hiring could not be verified (job-board search failed)");
      match.unknown.push("Hiring source unavailable — not treated as a confirmed non-hiring company");
      match.missingFields.push("Hiring");
      match.consideredFields.push("Hiring");
    } else if (!intel.website && !intel.hiring.evidence.length) {
      match.unknown.push("Hiring not measured (no public page or job board yet)");
    } else {
      match.missed.push("No hiring signal on crawled pages or job boards — public listing required");
      match.missingFields.push("Hiring");
      match.consideredFields.push("Hiring");
    }
  }
  if (spec.industry?.specializations?.length) {
    const hit = spec.industry.specializations.filter((s) => intel.specializations.includes(s));
    if (hit.length) match.matched.push(`Specialization ${hit.map(specializationLabel).join(", ")}`);
    else match.unknown.push("Requested specialization not evidenced on crawled pages");
  }

  rangeCheck("Commercial opportunity", intel.scores.commercialOpportunity, spec.compound?.commercialMin != null ? { min: spec.compound.commercialMin, unknown: "allow" } : undefined, match);
  rangeCheck("Digital opportunity", intel.scores.digitalOpportunity, spec.compound?.digitalOpportunityMin != null ? { min: spec.compound.digitalOpportunityMin, unknown: "allow" } : undefined, match);
  rangeCheck("Marketing waste", intel.scores.marketingWaste, spec.compound?.marketingWasteMin != null ? { min: spec.compound.marketingWasteMin, unknown: "allow" } : undefined, match);

  const considered = match.matched.length + match.missed.length;
  if (considered === 0) {
    match.score = null;
    match.status = "INSUFFICIENT_DATA";
    match.confidence = null;
    match.explanation = "Ei riittävästi tietoa pisteytykseen";
    match.why.push("No evaluated criteria produced a match or miss. Unknown fields are not treated as hits.");
  } else {
    match.score = Math.round((match.matched.length / considered) * 100);
    match.status = "EVALUATED";
    const conf = match.unknown.length ? 100 - match.unknown.length * 12 : 80;
    match.confidence = conf > 0 ? conf : null;
    match.explanation = `${match.matched.length}/${considered} evaluated criteria matched`;
  }
  if (match.matched.length) match.why.push(...match.matched);
  if (match.unknown.length) match.why.push(`Unknown (not invented): ${match.unknown.join("; ")}`);
  return match;
}

export function passesHardTarget(match: CompanyIntel["match"]): boolean {
  return match.missed.length === 0;
}
