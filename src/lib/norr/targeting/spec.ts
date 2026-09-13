export type UnknownPolicy = "require" | "allow" | "exclude";

export type RangeFilter = {
  min?: number | null;
  max?: number | null;
  unknown?: UnknownPolicy;
};

export type SearchMode = "quick" | "advanced" | "ai" | "deep" | "opportunity";

export type AdActivity = "ACTIVE" | "RECENT" | "HISTORICAL" | "NONE" | "UNKNOWN";
export type AdPlatformState = "DETECTED" | "LIKELY" | "NOT_DETECTED" | "UNKNOWN";
export type QualityBand = "excellent" | "good" | "average" | "weak" | "very_weak";
export type DigitalBand = "digital_leader" | "advanced" | "average" | "underdeveloped" | "digital_laggard";
export type TrafficBand = "very_low" | "low" | "medium" | "high" | "very_high";
export type GrowthBand = "declining" | "stable" | "growing" | "fast_growing" | "hypergrowth";
export type BalanceBand = "very_strong" | "strong" | "normal" | "weak" | "high_risk";

export type CustomerType = "b2b" | "b2c" | "b2g";

export type TargetSpec = {
  customerType?: CustomerType;
  financial?: {
    revenue?: RangeFilter;
    profit?: RangeFilter;
    operatingMargin?: RangeFilter;
    equityRatio?: RangeFilter;
    profitable?: boolean;
    balanceBand?: BalanceBand[];
  };
  company?: {
    ageYears?: RangeFilter;
    legalForm?: string[];
    active?: boolean;
  };
  industry?: {
    codes?: string[];
    specializations?: string[];
  };
  website?: {
    qualityScore?: RangeFilter;
    opportunityScore?: RangeFilter;
    seoScore?: RangeFilter;
    digitalMaturity?: RangeFilter;
    qualityBand?: QualityBand[];
    digitalBand?: DigitalBand[];
    highOpportunity?: boolean;
  };
  advertising?: {
    meta?: AdActivity | "ACTIVE_OR_RECENT";
    platforms?: string[];
    activityScore?: RangeFilter;
    recentlyStopped?: boolean;
  };
  traffic?: {
    band?: TrafficBand[];
    score?: RangeFilter;
  };
  tech?: {
    cms?: string[];
    frameworks?: string[];
    hasChat?: boolean | null;
    hasAnalytics?: boolean | null;
    hasEcommerce?: boolean | null;
    legacy?: boolean;
  };
  social?: {
    platforms?: string[];
    score?: RangeFilter;
  };
  hiring?: {
    active?: boolean;
    roles?: string[];
  };
  growth?: {
    band?: GrowthBand[];
  };
  compound?: {
    commercialMin?: number;
    digitalOpportunityMin?: number;
    marketingWasteMin?: number;
    modernizationMin?: number;
    purchaseCapacityMin?: number;
  };
};

export type OpportunityPresetId =
  | "website_sales"
  | "digitalization"
  | "marketing_sales"
  | "seo"
  | "ai_automation"
  | "fast_growing"
  | "financially_strong"
  | "distressed";

export const OPPORTUNITY_PRESETS: Record<
  OpportunityPresetId,
  { label: string; sells: string; blurb: string; target: TargetSpec; depth?: "normal" | "deep" }
> = {
  website_sales: {
    label: "Website development",
    sells: "Website development",
    blurb: "Active firms with enough scale and a weak public site.",
    depth: "deep",
    target: {
      website: { qualityScore: { max: 48, unknown: "allow" }, highOpportunity: true },
      company: { ageYears: { min: 3, unknown: "allow" }, active: true },
      financial: { revenue: { min: 500_000, unknown: "allow" } },
    },
  },
  digitalization: {
    label: "Digitalization / CRM / automation",
    sells: "CRM",
    blurb: "Established businesses with low digital maturity.",
    depth: "deep",
    target: {
      website: { digitalMaturity: { max: 45, unknown: "allow" } },
      company: { ageYears: { min: 5, unknown: "allow" }, active: true },
      financial: { revenue: { min: 1_000_000, unknown: "allow" } },
    },
  },
  marketing_sales: {
    label: "Advertising / landing pages",
    sells: "Advertising",
    blurb: "Ad infrastructure on a weak site. Possible wasted spend.",
    depth: "deep",
    target: {
      advertising: { meta: "ACTIVE_OR_RECENT" },
      website: { qualityScore: { max: 55, unknown: "allow" } },
      compound: { marketingWasteMin: 40 },
    },
  },
  seo: {
    label: "SEO",
    sells: "SEO",
    blurb: "Indexable sites with thin metadata and weak structure.",
    depth: "deep",
    target: {
      website: { seoScore: { max: 45, unknown: "allow" }, qualityScore: { max: 70, unknown: "allow" } },
      company: { active: true },
    },
  },
  ai_automation: {
    label: "AI automation",
    sells: "AI automation",
    blurb: "Scale, hiring, little public automation tooling.",
    depth: "deep",
    target: {
      hiring: { active: true },
      tech: { hasChat: false },
      financial: { revenue: { min: 1_000_000, unknown: "allow" } },
      company: { active: true },
    },
  },
  fast_growing: {
    label: "Fast-growing companies",
    sells: "Consulting",
    blurb: "Hiring, expansion or procurement on an active firm.",
    target: {
      growth: { band: ["growing", "fast_growing", "hypergrowth"] },
      hiring: { active: true },
      company: { active: true },
    },
  },
  financially_strong: {
    label: "Financially strong",
    sells: "Consulting",
    blurb: "Published profit or strong balance-sheet language. Unknown finances stay labelled.",
    target: {
      financial: { profitable: true, revenue: { min: 2_000_000, unknown: "allow" } },
      company: { active: true },
    },
  },
  distressed: {
    label: "Distressed / turnaround",
    sells: "Consulting",
    blurb: "Negative-result or weak-equity language when a source actually published it.",
    target: {
      financial: { profitable: false },
      company: { active: true },
    },
  },
};

export function emptyTarget(): TargetSpec {
  return {};
}

export function targetHasConstraint(spec?: TargetSpec | null): boolean {
  if (!spec) return false;
  return JSON.stringify(spec) !== "{}";
}

export function mergeTargets(base: TargetSpec, extra: TargetSpec): TargetSpec {
  return {
    customerType: extra.customerType ?? base.customerType,
    financial: { ...base.financial, ...extra.financial },
    company: { ...base.company, ...extra.company },
    industry: {
      codes: [...new Set([...(base.industry?.codes ?? []), ...(extra.industry?.codes ?? [])])],
      specializations: [...new Set([...(base.industry?.specializations ?? []), ...(extra.industry?.specializations ?? [])])],
    },
    website: { ...base.website, ...extra.website },
    advertising: { ...base.advertising, ...extra.advertising },
    traffic: { ...base.traffic, ...extra.traffic },
    tech: { ...base.tech, ...extra.tech },
    social: { ...base.social, ...extra.social },
    hiring: { ...base.hiring, ...extra.hiring },
    growth: { ...base.growth, ...extra.growth },
    compound: { ...base.compound, ...extra.compound },
  };
}

export const AGE_BUCKETS: Array<{ id: string; label: string; min?: number; max?: number }> = [
  { id: "lt1", label: "< 1 year", max: 1 },
  { id: "1-3", label: "1 to 3 years", min: 1, max: 3 },
  { id: "3-5", label: "3 to 5 years", min: 3, max: 5 },
  { id: "5-10", label: "5 to 10 years", min: 5, max: 10 },
  { id: "10-20", label: "10 to 20 years", min: 10, max: 20 },
  { id: "20-50", label: "20 to 50 years", min: 20, max: 50 },
  { id: "50+", label: "50+ years", min: 50 },
];

export const SIMPLE_REVENUE: Array<{ id: string; label: string; min?: number; max?: number }> = [
  { id: "any", label: "Any / unknown" },
  { id: "lt1m", label: "Under €1M", max: 1_000_000 },
  { id: "1-10m", label: "€1M to €10M", min: 1_000_000, max: 10_000_000 },
  { id: "10m+", label: "Over €10M", min: 10_000_000 },
];

export const SIMPLE_AGE: Array<{ id: string; label: string; min?: number; max?: number }> = [
  { id: "any", label: "Any age" },
  { id: "new", label: "Under 5 years", max: 5 },
  { id: "mid", label: "5 to 15 years", min: 5, max: 15 },
  { id: "est", label: "Over 15 years", min: 15 },
];

export const LEAD_COUNTS = [50, 100, 200, 300] as const;
export const UNLIMITED_LEAD_COUNTS = [50, 100, 300, 500, 1000, 2500, 5000, 10000] as const;

export function leadCountChoices(perSearch: number): number[] {
  if (!Number.isFinite(perSearch) || perSearch < 0) return [...UNLIMITED_LEAD_COUNTS];
  const base = [50, 100, 200, 300].filter((n) => n <= perSearch);
  if (perSearch >= 1 && !base.includes(perSearch)) base.push(perSearch);
  return base.length ? base : [Math.max(1, perSearch)];
}

