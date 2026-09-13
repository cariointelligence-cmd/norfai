import type { WebsiteIntel } from "./website.ts";
import type { CompanyIntel } from "./scores.ts";
import { classifyBalance, companyAgeYears, compoundScores, matchTarget } from "./scores.ts";
import { inferSpecializations } from "./industry.ts";
import type { SearchCriteria } from "../types.ts";
import type { GrowthBand } from "./spec.ts";
import { classifyHiring, hiringIsActive, type HiringLevel } from "../hiring-signal.ts";
import { deriveEquityRatio, financialGrowthYoY } from "../financials.ts";
import { measureEvidenceCompleteness, offerFromCriteria, personalizedEligibleRank } from "../ranking-v2.ts";

export function websiteIntelFromStored(raw: unknown): WebsiteIntel | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.score !== "number" && !Array.isArray(q.notes) && q.likelyWeak == null) return null;
  const score = typeof q.score === "number" ? q.score : null;
  return {
    score,
    band: (q.band as WebsiteIntel["band"]) ?? (score == null ? null : score < 35 ? "very_weak" : score < 50 ? "weak" : score < 65 ? "average" : score < 80 ? "good" : "excellent"),
    opportunityScore: typeof q.opportunityScore === "number" ? q.opportunityScore : null,
    seoScore: typeof q.seoScore === "number" ? q.seoScore : null,
    digitalMaturity: typeof q.digitalMaturity === "number" ? q.digitalMaturity : null,
    digitalBand: (q.digitalBand as WebsiteIntel["digitalBand"]) ?? null,
    estimatedGeneration: typeof q.estimatedGeneration === "string" ? q.estimatedGeneration : null,
    estimatedGenerationConfidence: typeof q.estimatedGenerationConfidence === "number" ? q.estimatedGenerationConfidence : null,
    copyrightYear: typeof q.copyrightYear === "number" ? q.copyrightYear : null,
    https: typeof q.https === "boolean" ? q.https : null,
    hasViewport: Boolean(q.hasViewport),
    hasTitle: Boolean(q.hasTitle ?? (typeof q.title === "string" && q.title.length > 2)),
    hasMetaDescription: Boolean(q.hasMetaDescription),
    hasH1: Boolean(q.hasH1),
    hasCanonical: Boolean(q.hasCanonical),
    hasSchema: Boolean(q.hasSchema),
    hasOpenGraph: Boolean(q.hasOpenGraph),
    formCount: Number(q.formCount ?? 0),
    hasChat: Boolean(q.hasChat),
    hasAnalytics: Boolean(q.hasAnalytics),
    pixels: Array.isArray(q.pixels) ? q.pixels.map(String) : [],
    cms: Array.isArray(q.cms) ? q.cms.map(String) : [],
    frameworks: Array.isArray(q.frameworks) ? q.frameworks.map(String) : [],
    ecommerce: Boolean(q.ecommerce),
    ctaHints: Boolean(q.ctaHints),
    contactVisible: Boolean(q.contactVisible),
    notes: Array.isArray(q.notes) ? q.notes.map(String) : [],
    likelyWeak: Boolean(q.likelyWeak),
    tech: Array.isArray(q.tech) ? q.tech.map(String) : [],
    trafficScore: null,
    trafficBand: null,
    adPlatforms: (q.adPlatforms as WebsiteIntel["adPlatforms"]) ?? {
      meta: "UNKNOWN",
      google_ads: "UNKNOWN",
      linkedin: "UNKNOWN",
      tiktok: "UNKNOWN",
      microsoft_ads: "UNKNOWN",
    },
    adActivityScore: typeof q.adActivityScore === "number" ? q.adActivityScore : null,
    adIntensity: (q.adIntensity as WebsiteIntel["adIntensity"]) ?? null,
    social: (q.social as Record<string, boolean>) ?? {},
    socialScore: typeof q.socialScore === "number" ? q.socialScore : null,
    evidence: Array.isArray(q.evidence) ? q.evidence.map(String) : [],
  };
}

export function buildCompanyIntel(opts: {
  registrationDate: string | null;
  revenue: number | null;
  revenueSource?: string | null;
  revenueYear?: string | null;
  previousRevenue?: number | null;
  profit: number | null;
  equity?: number | null;
  assets?: number | null;
  employeeCount: number | null;
  industryCode: string | null;
  industryLabel: string | null;
  description: string | null;
  website: WebsiteIntel | null;
  hiring: boolean;
  hiringLevel?: HiringLevel;
  hiringConfirmed?: boolean;
  hiringSourceFailed?: boolean;
  expansion: boolean;
  procurement: boolean;
  criteria: SearchCriteria;
  municipality?: string | null;
  hasPublishedContact?: boolean;
}): CompanyIntel {
  const age = companyAgeYears(opts.registrationDate);
  const margin = opts.revenue && opts.profit != null && opts.revenue > 0 ? opts.profit / opts.revenue : null;
  const profitable = opts.profit == null ? null : opts.profit > 0;
  const equityRatio = deriveEquityRatio(opts.equity ?? null, opts.assets ?? null);
  const specializations = inferSpecializations(
    `${opts.description ?? ""} ${opts.industryLabel ?? ""} ${(opts.website?.notes ?? []).join(" ")}`,
    opts.industryCode,
  );
  const hiringLevel = opts.hiringLevel ?? classifyHiring({
    confirmedListings: opts.hiringConfirmed ? 1 : 0,
    indicatedOnSite: opts.hiring && !opts.hiringConfirmed,
  });
  const yoy = financialGrowthYoY(opts.revenue, opts.previousRevenue ?? null);
  let growthBand: GrowthBand | null = null;
  const growthEvidence: string[] = [];
  if (yoy != null) {
    if (yoy >= 0.2) growthBand = "fast_growing";
    else if (yoy > 0.02) growthBand = "growing";
    else if (yoy > -0.02) growthBand = "stable";
    else growthBand = "declining";
    growthEvidence.push(`Financial growth YoY ${(yoy * 100).toFixed(1)}% from comparable periods`);
  }
  if (opts.expansion) growthEvidence.push("Expansion language on a public page (not financial growth)");
  if (opts.procurement) growthEvidence.push("Procurement notice");
  const scores = compoundScores({
    revenue: opts.revenue,
    profit: opts.profit,
    profitable,
    equityRatio,
    ageYears: age,
    website: opts.website,
    hiring: hiringIsActive(hiringLevel) && hiringLevel === "HIRING_CONFIRMED",
    expansion: opts.expansion,
    procurement: opts.procurement,
    financialGrowth: yoy,
  });
  const base = {
    companyAgeYears: age,
    registrationDate: opts.registrationDate,
    revenue: opts.revenue,
    revenueYear: opts.revenueYear ?? null,
    revenueSource: opts.revenueSource ?? null,
    profit: opts.profit,
    operatingMargin: margin,
    equityRatio,
    profitable,
    balanceBand: classifyBalance({ equityRatio, profitable }),
    employeeCount: opts.employeeCount,
    industryCode: opts.industryCode,
    industryLabel: opts.industryLabel,
    specializations,
    website: opts.website,
    hiring: {
      active: hiringIsActive(hiringLevel),
      evidence: [
        ...(hiringLevel === "HIRING_UNKNOWN" ? [] : [hiringLevel]),
        ...(opts.hiringSourceFailed ? ["HIRING_SOURCE_FAILED" as const] : []),
      ],
    },
    growth: { band: growthBand, score: scores.growthReadiness, evidence: growthEvidence },
    scores,
  };
  const match = matchTarget(base, opts.criteria.target);
  const evidenceCompleteness = measureEvidenceCompleteness({
    hasIdentity: Boolean(opts.registrationDate),
    hasIndustry: Boolean(opts.industryCode || opts.industryLabel),
    hasLocation: Boolean(opts.municipality),
    hasRevenue: opts.revenue != null,
    hasWebsiteMeasured: Boolean(opts.website),
    hasHiringSignal: hiringLevel !== "HIRING_UNKNOWN",
    hasPublishedContact: Boolean(opts.hasPublishedContact),
  });
  const offer = offerFromCriteria(opts.criteria);
  const personalized = personalizedEligibleRank({
    matchScore: match.score,
    overallConfidence: match.score,
    offer,
    hiringConfirmed: hiringLevel === "HIRING_CONFIRMED",
    websiteWeak: Boolean(opts.website?.likelyWeak),
    hasPublishedContact: Boolean(opts.hasPublishedContact),
    financialGrowth: yoy,
    purchaseCapacity: scores.purchaseCapacity,
  });
  return {
    ...base,
    match,
    evidenceCompleteness,
    personalized: { score: personalized.score, offer, contributions: personalized.contributions },
  };
}
