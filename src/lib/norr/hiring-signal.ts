import { coreCompanyName, isDistinctiveCoreName } from "./dedupe.ts";
import { resolveEntityMatch } from "./entity-match.ts";

export const HIRING_LEVELS = ["HIRING_CONFIRMED", "HIRING_INDICATED", "HIRING_HISTORICAL", "HIRING_UNKNOWN"] as const;
export type HiringLevel = (typeof HIRING_LEVELS)[number];

export const HIRING_FRESH_DAYS = 120;

export type HiringFreshness = "ACTIVE" | "RECENT" | "STALE" | "HISTORICAL" | "UNKNOWN";

export type HiringCategory =
  | "SALES_HIRING"
  | "TECH_HIRING"
  | "MARKETING_HIRING"
  | "OPERATIONS_HIRING"
  | "MANAGEMENT_HIRING"
  | "GENERAL_HIRING";

export type HiringEvidence = {
  level: HiringLevel;
  title?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | null;
  company?: string | null;
  location?: string | null;
  category?: HiringCategory;
  freshness?: HiringFreshness;
};

export function classifyHiring(opts: {
  confirmedListings: number;
  indicatedOnSite: boolean;
  oldestConfirmedAt?: string | null;
  newestConfirmedAt?: string | null;
  now?: Date;
}): HiringLevel {
  const now = opts.now ?? new Date();
  const stamp = opts.newestConfirmedAt ?? opts.oldestConfirmedAt;
  if (opts.confirmedListings > 0) {
    if (stamp) {
      const days = (now.getTime() - new Date(stamp).getTime()) / 86400000;
      if (Number.isFinite(days) && days > HIRING_FRESH_DAYS) return "HIRING_HISTORICAL";
    }
    return "HIRING_CONFIRMED";
  }
  if (opts.indicatedOnSite) return "HIRING_INDICATED";
  return "HIRING_UNKNOWN";
}

export function hiringFreshness(observedAt: string | Date | null | undefined, now = new Date()): HiringFreshness {
  if (!observedAt) return "UNKNOWN";
  const t = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(t.getTime())) return "UNKNOWN";
  const days = (now.getTime() - t.getTime()) / 86400000;
  if (days < 0) return "ACTIVE";
  if (days <= 30) return "ACTIVE";
  if (days <= 90) return "RECENT";
  if (days <= 180) return "STALE";
  return "HISTORICAL";
}

export function classifyHiringCategory(title: string | null | undefined): HiringCategory {
  const t = title ?? "";
  if (/myyjä|myynti|account executive|sales(?:person| rep)|kaupallinen/i.test(t)) return "SALES_HIRING";
  if (/developer|ohjelmist|software|data engineer|\bit\b|fullstack|backend|frontend/i.test(t)) return "TECH_HIRING";
  if (/markkinoin|marketing|seo\b|copywriter|content/i.test(t)) return "MARKETING_HIRING";
  if (/varasto|warehouse|kuljettaja|driver|tuotanto|operator|logisti/i.test(t)) return "OPERATIONS_HIRING";
  if (/johtaja|director|päällikkö|manager|head of/i.test(t)) return "MANAGEMENT_HIRING";
  return "GENERAL_HIRING";
}

export function hiringScoreWeight(level: HiringLevel): number {
  switch (level) {
    case "HIRING_CONFIRMED":
      return 1;
    case "HIRING_INDICATED":
      return 0.35;
    case "HIRING_HISTORICAL":
      return 0.15;
    default:
      return 0;
  }
}

export function hiringIsActive(level: HiringLevel): boolean {
  return level === "HIRING_CONFIRMED" || level === "HIRING_INDICATED";
}

export function hiringIsCurrent(level: HiringLevel, freshness?: HiringFreshness): boolean {
  if (level !== "HIRING_CONFIRMED") return false;
  if (!freshness || freshness === "UNKNOWN") return true;
  return freshness === "ACTIVE" || freshness === "RECENT";
}

export function hiringLabel(level: HiringLevel): string {
  switch (level) {
    case "HIRING_CONFIRMED":
      return "Hiring confirmed (public job listing)";
    case "HIRING_INDICATED":
      return "Hiring indicated on company website";
    case "HIRING_HISTORICAL":
      return "Hiring signal is older than freshness window";
    default:
      return "Hiring unknown";
  }
}

const JOB_BOARD_ORG = /duunitori|jobly|työmarkkinatori|tyomarkkinatori|monster|indeed|linkedin|te-palvelut/i;

/** First-party schema.org JobPosting may confirm hiring. A listing for a different employer on that page must not. */
export function firstPartyJobListingAttach(opts: {
  companyName: string;
  companyWebsite?: string | null;
  pageUrl: string;
  orgName?: string | null;
}): { attach: boolean; reason: string } {
  let pageHost = "";
  let coHost = "";
  try {
    pageHost = new URL(opts.pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    /* keep empty */
  }
  try {
    if (opts.companyWebsite) coHost = new URL(opts.companyWebsite).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    /* keep empty */
  }
  const firstParty = Boolean(
    pageHost &&
      coHost &&
      (pageHost === coHost || pageHost.endsWith(`.${coHost}`) || coHost.endsWith(`.${pageHost}`)),
  );
  if (!firstParty) return { attach: false, reason: "JobPosting is not on the company website" };
  const org = (opts.orgName ?? "").trim();
  if (!org || JOB_BOARD_ORG.test(org)) {
    return { attach: true, reason: "schema.org JobPosting on first-party page" };
  }
  const match = resolveEntityMatch({
    company: { name: opts.companyName, domain: coHost || null },
    source: { name: org, domain: pageHost || null },
  });
  if (match.status === "NO_MATCH" && isDistinctiveCoreName(coreCompanyName(org)) && match.nameSimilarity < 50) {
    return { attach: false, reason: "JobPosting hiringOrganization is a different company" };
  }
  return { attach: true, reason: "schema.org JobPosting on first-party page" };
}

export function hiringFaceLabel(evidence: string[] | null | undefined): string {
  const ev = evidence ?? [];
  if (ev.includes("HIRING_CONFIRMED")) return "Confirmed listing";
  if (ev.includes("HIRING_HISTORICAL")) return "Historical listing";
  if (ev.includes("HIRING_INDICATED")) return "Indicated on site";
  if (ev.includes("HIRING_SOURCE_FAILED")) return "Source failed";
  return "Unknown";
}

export function whyNowHiring(opts: { level: HiringLevel; freshness?: HiringFreshness; category?: HiringCategory; title?: string | null }): string | null {
  if (opts.level !== "HIRING_CONFIRMED") return null;
  if (opts.freshness === "STALE" || opts.freshness === "HISTORICAL") return null;
  const cat = opts.category ?? classifyHiringCategory(opts.title);
  if (cat === "SALES_HIRING") return "Public listing for a sales role. Sales capacity may be expanding.";
  if (cat === "TECH_HIRING") return "Public listing for a technology role.";
  if (cat === "MARKETING_HIRING") return "Public listing for a marketing role.";
  return hiringLabel("HIRING_CONFIRMED");
}
