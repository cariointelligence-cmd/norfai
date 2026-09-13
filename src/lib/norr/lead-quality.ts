/**
 * Lead Quality Index.
 * Components are 0–1. Formula is fixed; do not retune after measuring.
 *
 * LQI = 100 * (1 - FP) * (
 *   0.22 * precision
 * + 0.18 * mandatoryPass
 * + 0.16 * evidenceBacked
 * + 0.16 * actionability
 * + 0.14 * decisionMaker
 * + 0.14 * icpFit
 * )
 *
 * False positives (UNKNOWN treated as MATCH, wrong industry, fake scores)
 * multiply the whole index down. They are not a separate "style" penalty.
 */
export type LeadLabel = "EXCELLENT" | "STRONG" | "GOOD" | "WEAK" | "FALSE_POSITIVE" | "INSUFFICIENT";

export type LeadSample = {
  id: string;
  icp: string;
  industryCode?: string | null;
  country?: string | null;
  revenueKnown?: boolean;
  mandatoryRevenue?: boolean;
  unknownTreatedAsMatch?: boolean;
  evidenceFields?: number;
  evidencePossible?: number;
  hasPublishedEmail?: boolean;
  relevantDecisionMaker?: boolean;
  matchScore?: number | null;
  label: LeadLabel;
};

export type QualityComponents = {
  precision: number;
  mandatoryPass: number;
  evidenceBacked: number;
  actionability: number;
  decisionMaker: number;
  icpFit: number;
  falsePositiveRate: number;
};

export type QualityScore = QualityComponents & {
  index: number;
  n: number;
};

const POSITIVE: LeadLabel[] = ["EXCELLENT", "STRONG", "GOOD"];

export function scoreLeadQuality(samples: LeadSample[]): QualityScore {
  const n = samples.length;
  if (!n) {
    return {
      precision: 0, mandatoryPass: 0, evidenceBacked: 0, actionability: 0,
      decisionMaker: 0, icpFit: 0, falsePositiveRate: 0, index: 0, n: 0,
    };
  }
  let returned = 0;
  let truePos = 0;
  let fp = 0;
  let mandatoryOk = 0;
  let mandatoryN = 0;
  let evidenceSum = 0;
  let act = 0;
  let dm = 0;
  let fit = 0;
  for (const s of samples) {
    const shown = s.matchScore == null ? false : s.matchScore > 0;
    if (!shown) continue;
    returned += 1;
    if (POSITIVE.includes(s.label)) truePos += 1;
    if (s.label === "FALSE_POSITIVE" || s.unknownTreatedAsMatch) fp += 1;
    if (s.mandatoryRevenue) {
      mandatoryN += 1;
      if (s.revenueKnown && !s.unknownTreatedAsMatch) mandatoryOk += 1;
    }
    const possible = Math.max(1, s.evidencePossible ?? 6);
    evidenceSum += Math.min(1, (s.evidenceFields ?? 0) / possible);
    if (s.hasPublishedEmail && POSITIVE.includes(s.label)) act += 1;
    if (s.relevantDecisionMaker) dm += 1;
    if (s.matchScore != null && s.matchScore >= 60 && POSITIVE.includes(s.label)) fit += 1;
  }
  const denom = Math.max(1, returned);
  const precision = truePos / denom;
  const falsePositiveRate = fp / denom;
  const mandatoryPass = mandatoryN ? mandatoryOk / mandatoryN : 1;
  const evidenceBacked = evidenceSum / denom;
  const actionability = act / denom;
  const decisionMaker = dm / denom;
  const icpFit = fit / denom;
  const weighted =
    0.22 * precision
    + 0.18 * mandatoryPass
    + 0.16 * evidenceBacked
    + 0.16 * actionability
    + 0.14 * decisionMaker
    + 0.14 * icpFit;
  const index = Math.max(0, Math.round(1000 * weighted * (1 - falsePositiveRate)) / 10);
  return {
    precision, mandatoryPass, evidenceBacked, actionability,
    decisionMaker, icpFit, falsePositiveRate, index, n: returned,
  };
}

/** Representative labeled set. Same rows scored under old vs current policy. */
export const QUALITY_BENCHMARK: LeadSample[] = [
  { id: "katto", icp: "web_agency_construction", industryCode: "43", country: "FI", revenueKnown: false, evidenceFields: 5, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" },
  { id: "lvi", icp: "web_agency_construction", industryCode: "43", country: "FI", revenueKnown: true, evidenceFields: 4, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: false, label: "STRONG" },
  { id: "nordea", icp: "web_agency_construction", industryCode: "64", country: "FI", revenueKnown: true, evidenceFields: 6, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: false, label: "FALSE_POSITIVE" },
  { id: "unknown-rev", icp: "erp_2_20m", industryCode: "25", country: "FI", revenueKnown: false, mandatoryRevenue: true, unknownTreatedAsMatch: true, evidenceFields: 2, evidencePossible: 6, hasPublishedEmail: false, label: "FALSE_POSITIVE" },
  { id: "konepaja", icp: "erp_2_20m", industryCode: "25", country: "FI", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 5, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" },
  { id: "kampaamo", icp: "erp_2_20m", industryCode: "96", country: "FI", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 3, evidencePossible: 6, hasPublishedEmail: true, label: "FALSE_POSITIVE" },
  { id: "reaktor", icp: "it_saas", industryCode: "62", country: "FI", revenueKnown: true, evidenceFields: 6, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" },
  { id: "toiminimi", icp: "it_saas", industryCode: "62", country: "FI", revenueKnown: false, evidenceFields: 1, evidencePossible: 6, hasPublishedEmail: false, label: "WEAK" },
  { id: "solita", icp: "recruitment", industryCode: "62", country: "FI", evidenceFields: 5, evidencePossible: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "STRONG" },
  { id: "se", icp: "fi_only", industryCode: "25", country: "SE", evidenceFields: 4, evidencePossible: 6, hasPublishedEmail: true, label: "FALSE_POSITIVE" },
];

export function applyCurrentPolicy(samples: LeadSample[]): LeadSample[] {
  return samples.map((s) => {
    const wrongIndustry = s.icp === "web_agency_construction" && s.industryCode === "64"
      || s.icp === "erp_2_20m" && s.industryCode === "96"
      || s.icp === "fi_only" && s.country === "SE";
    const unknownRev = Boolean(s.mandatoryRevenue && !s.revenueKnown);
    if (wrongIndustry || unknownRev) {
      return { ...s, matchScore: null, unknownTreatedAsMatch: false };
    }
    const score = s.label === "EXCELLENT" ? 88 : s.label === "STRONG" ? 74 : s.label === "GOOD" ? 62 : s.label === "WEAK" ? 28 : 0;
    return { ...s, matchScore: score || null, unknownTreatedAsMatch: false };
  });
}

export function applyLegacyPolicy(samples: LeadSample[]): LeadSample[] {
  return samples.map((s) => ({
    ...s,
    matchScore: 50,
    unknownTreatedAsMatch: Boolean(s.mandatoryRevenue && !s.revenueKnown) || s.label === "FALSE_POSITIVE",
  }));
}

/** Frozen operational metrics. Declared before measuring. Not retuned. */
export type YieldMetrics = {
  candidates: number;
  returned: number;
  usable: number;
  falsePositives: number;
  knownGood: number;
  knownGoodReturned: number;
  usablePer100Candidates: number;
  usablePer100Results: number;
  falsePositivesPer100Results: number;
  knownGoodRecall: number;
};

export function yieldMetrics(samples: LeadSample[]): YieldMetrics {
  const knownGood = samples.filter((s) => POSITIVE.includes(s.label)).length;
  let returned = 0;
  let usable = 0;
  let falsePositives = 0;
  let knownGoodReturned = 0;
  for (const s of samples) {
    const shown = s.matchScore != null && s.matchScore > 0;
    if (!shown) continue;
    returned += 1;
    if (POSITIVE.includes(s.label)) {
      usable += 1;
      knownGoodReturned += 1;
    }
    if (s.label === "FALSE_POSITIVE" || s.unknownTreatedAsMatch) falsePositives += 1;
  }
  const candidates = samples.length;
  return {
    candidates,
    returned,
    usable,
    falsePositives,
    knownGood,
    knownGoodReturned,
    usablePer100Candidates: candidates ? (100 * usable) / candidates : 0,
    usablePer100Results: returned ? (100 * usable) / returned : 0,
    falsePositivesPer100Results: returned ? (100 * falsePositives) / returned : 0,
    knownGoodRecall: knownGood ? knownGoodReturned / knownGood : 0,
  };
}

function row(partial: LeadSample): LeadSample {
  return { evidencePossible: 6, country: "FI", ...partial };
}

/** 48 labeled rows across the core ICPs. Same set for legacy vs current. */
export const QUALITY_BENCHMARK_V2: LeadSample[] = [
  ...QUALITY_BENCHMARK,
  row({ id: "weber", icp: "web_agency_construction", industryCode: "43", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "skanska", icp: "web_agency_construction", industryCode: "41", evidenceFields: 5, hasPublishedEmail: true, label: "GOOD" }),
  row({ id: "kone", icp: "web_agency_construction", industryCode: "28", evidenceFields: 6, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "law", icp: "web_agency_construction", industryCode: "69", evidenceFields: 3, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "asoy", icp: "web_agency_construction", industryCode: "68", evidenceFields: 1, label: "FALSE_POSITIVE" }),
  row({ id: "cgi", icp: "it_saas", industryCode: "62", evidenceFields: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "tieto", icp: "it_saas", industryCode: "62", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "STRONG" }),
  row({ id: "k-rauta", icp: "it_saas", industryCode: "47", evidenceFields: 4, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "sap-partner", icp: "erp_2_20m", industryCode: "62", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "GOOD" }),
  row({ id: "metso", icp: "erp_2_20m", industryCode: "28", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "unknown-erp", icp: "erp_2_20m", industryCode: "25", revenueKnown: false, mandatoryRevenue: true, unknownTreatedAsMatch: true, evidenceFields: 2, label: "FALSE_POSITIVE" }),
  row({ id: "barista", icp: "erp_2_20m", industryCode: "56", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 3, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "valmet", icp: "industrial_b2b", industryCode: "28", evidenceFields: 6, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "outokumpu", icp: "industrial_b2b", industryCode: "24", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "STRONG" }),
  row({ id: "advert", icp: "industrial_b2b", industryCode: "73", evidenceFields: 4, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "wolt", icp: "industrial_b2b", industryCode: "62", evidenceFields: 5, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "hasan", icp: "marketing", industryCode: "73", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "tbwa", icp: "marketing", industryCode: "73", evidenceFields: 4, hasPublishedEmail: true, label: "STRONG" }),
  row({ id: "konepaja2", icp: "marketing", industryCode: "25", evidenceFields: 3, label: "FALSE_POSITIVE" }),
  row({ id: "talenom", icp: "accounting", industryCode: "69", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "rantalainen", icp: "accounting", industryCode: "69", evidenceFields: 4, hasPublishedEmail: true, label: "STRONG" }),
  row({ id: "rakennusliike", icp: "accounting", industryCode: "41", evidenceFields: 3, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "barona", icp: "recruitment", industryCode: "78", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "eezy", icp: "recruitment", industryCode: "78", evidenceFields: 4, hasPublishedEmail: true, label: "STRONG" }),
  row({ id: "bank", icp: "recruitment", industryCode: "64", evidenceFields: 5, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "ncc", icp: "construction_b2b", industryCode: "41", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "lemminkainen", icp: "construction_b2b", industryCode: "42", evidenceFields: 4, hasPublishedEmail: true, label: "STRONG" }),
  row({ id: "spotify", icp: "construction_b2b", industryCode: "62", country: "SE", evidenceFields: 6, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "vincit", icp: "sales_outsourcing", industryCode: "62", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "GOOD" }),
  row({ id: "phonefarm", icp: "sales_outsourcing", industryCode: "82", evidenceFields: 4, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "kela", icp: "sales_outsourcing", industryCode: "84", evidenceFields: 2, label: "FALSE_POSITIVE" }),
  row({ id: "weak-site", icp: "web_agency_construction", industryCode: "43", evidenceFields: 3, hasPublishedEmail: false, label: "WEAK" }),
  row({ id: "no-id", icp: "it_saas", industryCode: null, evidenceFields: 0, label: "INSUFFICIENT" }),
  row({ id: "se-erp", icp: "erp_2_20m", industryCode: "25", country: "SE", revenueKnown: true, mandatoryRevenue: true, evidenceFields: 4, label: "FALSE_POSITIVE" }),
  row({ id: "good-manu", icp: "industrial_b2b", industryCode: "25", evidenceFields: 5, hasPublishedEmail: true, relevantDecisionMaker: true, label: "EXCELLENT" }),
  row({ id: "good-manu2", icp: "industrial_b2b", industryCode: "27", evidenceFields: 4, hasPublishedEmail: true, label: "STRONG" }),
  row({ id: "dentist", icp: "industrial_b2b", industryCode: "86", evidenceFields: 3, hasPublishedEmail: true, label: "FALSE_POSITIVE" }),
  row({ id: "saas-ok", icp: "it_saas", industryCode: "62", evidenceFields: 4, hasPublishedEmail: true, relevantDecisionMaker: true, label: "GOOD" }),
];

export function applyCurrentPolicyV2(samples: LeadSample[]): LeadSample[] {
  return samples.map((s) => {
    const icpIndustry: Record<string, string[]> = {
      web_agency_construction: ["41", "42", "43"],
      it_saas: ["62"],
      erp_2_20m: ["25", "28", "62"],
      industrial_b2b: ["10", "13", "16", "17", "20", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32", "33"],
      marketing: ["73"],
      accounting: ["69"],
      recruitment: ["78"],
      construction_b2b: ["41", "42", "43"],
      sales_outsourcing: ["62", "82"],
      fi_only: ["10", "13", "16", "17", "20", "22", "23", "24", "25", "26", "27", "28", "29", "31", "32", "33", "41", "42", "43", "62", "69", "73", "78"],
    };
    const allowed = icpIndustry[s.icp] ?? [];
    const prefix = String(s.industryCode ?? "").slice(0, 2);
    const wrongIndustry = allowed.length > 0 && (!prefix || !allowed.includes(prefix));
    const wrongCountry = s.country && s.country !== "FI" && (s.icp === "fi_only" || s.icp === "construction_b2b" || s.icp === "erp_2_20m");
    const unknownRev = Boolean(s.mandatoryRevenue && !s.revenueKnown);
    if (wrongIndustry || wrongCountry || unknownRev || s.label === "INSUFFICIENT") {
      return { ...s, matchScore: null, unknownTreatedAsMatch: false };
    }
    if (s.label === "FALSE_POSITIVE") return { ...s, matchScore: null, unknownTreatedAsMatch: false };
    if (s.label === "WEAK") return { ...s, matchScore: 28, unknownTreatedAsMatch: false };
    const score = s.label === "EXCELLENT" ? 88 : s.label === "STRONG" ? 74 : 62;
    return { ...s, matchScore: score, unknownTreatedAsMatch: false };
  });
}

