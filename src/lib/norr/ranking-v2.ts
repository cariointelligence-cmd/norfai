import { offerFamilyFromText, type OfferFamily } from "./role-relevance.ts";
import type { HiringCategory } from "./hiring-signal.ts";
import type { SearchCriteria } from "./types.ts";

export type EvidenceCompleteness = {
  score: number | null;
  present: string[];
  missing: string[];
  state: "NOT_EVALUATED" | "EVALUATED";
};

/** Completeness of evidence, not fit. Missing data is not a bad company. */
export function measureEvidenceCompleteness(opts: {
  hasIdentity: boolean;
  hasIndustry: boolean;
  hasLocation: boolean;
  hasRevenue: boolean;
  hasWebsiteMeasured: boolean;
  hasHiringSignal: boolean;
  hasPublishedContact: boolean;
}): EvidenceCompleteness {
  const present: string[] = [];
  const missing: string[] = [];
  const bit = (ok: boolean, label: string) => {
    if (ok) present.push(label);
    else missing.push(label);
  };
  bit(opts.hasIdentity, "Legal identity");
  bit(opts.hasIndustry, "Industry");
  bit(opts.hasLocation, "Location");
  bit(opts.hasRevenue, "Published revenue");
  bit(opts.hasWebsiteMeasured, "Website crawl");
  bit(opts.hasHiringSignal, "Hiring evaluated");
  bit(opts.hasPublishedContact, "Published contact");
  const denom = present.length + missing.length;
  if (!denom) return { score: null, present, missing, state: "NOT_EVALUATED" };
  return { score: Math.round((present.length / denom) * 100), present, missing, state: "EVALUATED" };
}

/**
 * Offer-specific boost among already eligible companies.
 * Never a substitute for match. Never applied to rejected rows.
 */
export function queryAwareContributions(opts: {
  offer: OfferFamily;
  hiringConfirmed: boolean;
  hiringCategory?: HiringCategory | null;
  websiteWeak: boolean;
  hasPublishedContact: boolean;
  financialGrowth: number | null;
  purchaseCapacity: number | null;
}): { boost: number; contributions: string[] } {
  const contributions: string[] = [];
  let boost = 0;
  const { offer } = opts;
  if (offer === "recruitment" && opts.hiringConfirmed) {
    boost += 18;
    contributions.push("Hiring listings weighted for a recruitment offer");
    if (opts.hiringCategory === "SALES_HIRING" || opts.hiringCategory === "MANAGEMENT_HIRING") {
      boost += 4;
      contributions.push(`Hiring category ${opts.hiringCategory}`);
    }
  }
  if ((offer === "website" || offer === "seo" || offer === "marketing") && opts.websiteWeak) {
    boost += 16;
    contributions.push("Measured website issues weighted for a web/digital offer");
  }
  if (offer === "cyber" && opts.purchaseCapacity != null && opts.purchaseCapacity >= 70) {
    boost += 10;
    contributions.push("Published financial capacity weighted for a cybersecurity offer");
  }
  if ((offer === "erp" || offer === "saas") && opts.purchaseCapacity != null && opts.purchaseCapacity >= 50) {
    boost += 10;
    contributions.push("Published financial capacity weighted for an ERP/SaaS offer");
  }
  if (opts.hasPublishedContact) {
    boost += 6;
    contributions.push("Published contact available");
  }
  if (opts.financialGrowth != null && opts.financialGrowth >= 0.1 && offer !== "recruitment") {
    boost += 6;
    contributions.push("Comparable-period revenue growth");
  }
  return { boost: Math.min(24, boost), contributions };
}

/** Fit only. Commercial opportunity is not a match fallback. */
export function eligibleSearchScore(opts: { matchScore: number | null; overallConfidence: number | null }): number {
  if (opts.matchScore != null && Number.isFinite(opts.matchScore)) return opts.matchScore;
  if (opts.overallConfidence != null && Number.isFinite(opts.overallConfidence)) return opts.overallConfidence;
  return 0;
}

export function personalizedEligibleRank(opts: {
  matchScore: number | null;
  overallConfidence: number | null;
  offer: OfferFamily;
  hiringConfirmed: boolean;
  hiringCategory?: HiringCategory | null;
  websiteWeak: boolean;
  hasPublishedContact: boolean;
  financialGrowth: number | null;
  purchaseCapacity: number | null;
}): { score: number; contributions: string[] } {
  const fit = eligibleSearchScore(opts);
  const q = queryAwareContributions(opts);
  return { score: Math.min(100, Math.round(fit + q.boost)), contributions: q.contributions };
}

export function offerFromCriteria(criteria: SearchCriteria | null | undefined): OfferFamily {
  return offerFamilyFromText(String(criteria?.prompt ?? ""));
}
