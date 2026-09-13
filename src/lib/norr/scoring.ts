import type { SearchCriteria } from "./types.ts";
import { valuesOf } from "./criteria.ts";
import { industryMatches } from "./finland.ts";

export type ScoreInput = {
  criteria: SearchCriteria;
  industryCode: string | null;
  municipality: string | null;
  country: string | null;
  hasWebsite: boolean;
  websiteWeak: boolean;
  employeeCount: number | null;
  revenue: number | null;
  hasDecisionMaker: boolean;
  hasPublishedEmail: boolean;
  hasPublishedPhone: boolean;
  hasHiring: boolean;
  hasProcurement: boolean;
  hasFunding: boolean;
  hasExpansion: boolean;
  hasProjects: boolean;
  lastVerifiedAt: string | null;
  sourceReliabilityAvg: number | null;
  confidenceFloor: number;
  hiringLevel?: "HIRING_CONFIRMED" | "HIRING_INDICATED" | "HIRING_HISTORICAL" | "HIRING_UNKNOWN";
};

export type ScoreBreakdown = {
  score: number;
  matched: string[];
  missed: string[];
  signals: string[];
  uncertain: string[];
  parts: Array<{ key: string; weight: number; earned: number; why: string }>;
};

export const DEFAULT_WEIGHTS: Record<string, number> = {
  criteria_match: 18,
  industry: 10,
  size: 6,
  revenue: 6,
  growth: 5,
  geography: 8,
  decision_maker: 10,
  verified_email: 8,
  verified_phone: 5,
  website_weak: 4,
  hiring: 4,
  procurement: 5,
  funding: 3,
  expansion: 3,
  projects: 3,
  freshness: 6,
  source_reliability: 6,
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreCompany(input: ScoreInput, weights = DEFAULT_WEIGHTS): ScoreBreakdown {
  const matched: string[] = [];
  const missed: string[] = [];
  const signals: string[] = [];
  const uncertain: string[] = [];
  const parts: ScoreBreakdown["parts"] = [];

  const add = (key: string, earned: number, why: string, bucket?: "m" | "x" | "s" | "u") => {
    const weight = weights[key] ?? 0;
    parts.push({ key, weight, earned: Math.round(earned * 10) / 10, why });
    if (bucket === "m") matched.push(why);
    if (bucket === "x") missed.push(why);
    if (bucket === "s") signals.push(why);
    if (bucket === "u") uncertain.push(why);
  };

  const industries = valuesOf(input.criteria, "industry").map(String);
  if (industries.length) {
    const ok = industryMatches(input.industryCode, industries);
    add("industry", ok ? weights.industry! : 0, ok ? `Industry ${input.industryCode} matches ${industries.join(", ")}` : `Industry ${input.industryCode ?? "unknown"} did not match ${industries.join(", ")}`, ok ? "m" : "x");
    if (!input.industryCode) uncertain.push("Industry code not found");
  }

  const muns = valuesOf(input.criteria, "municipality").map(String);
  if (muns.length) {
    const ok = Boolean(input.municipality && muns.some((m) => input.municipality!.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(input.municipality!.toLowerCase())));
    add("geography", ok ? weights.geography! : 0, ok ? `Located in ${input.municipality}` : `Location ${input.municipality ?? "unknown"} vs ${muns.join(", ")}`, ok ? "m" : "x");
  }

  const empMin = valuesOf(input.criteria, "employee_min")[0] as number | undefined;
  const empMax = valuesOf(input.criteria, "employee_max")[0] as number | undefined;
  if (empMin != null || empMax != null) {
    if (input.employeeCount == null) {
      add("size", 0, "Employee count not found in connected sources", "u");
    } else {
      const ok =
        (empMin == null || input.employeeCount >= empMin) &&
        (empMax == null || input.employeeCount <= empMax);
      add("size", ok ? weights.size! : 0, `Employees ${input.employeeCount}`, ok ? "m" : "x");
    }
  }

  const revMin = valuesOf(input.criteria, "revenue_min")[0] as number | undefined;
  const revMax = valuesOf(input.criteria, "revenue_max")[0] as number | undefined;
  if (revMin != null || revMax != null) {
    if (input.revenue == null) add("revenue", 0, "Revenue not found in connected sources", "u");
    else {
      const ok = (revMin == null || input.revenue >= revMin) && (revMax == null || input.revenue <= revMax);
      add("revenue", ok ? weights.revenue! : 0, `Revenue ${input.revenue}`, ok ? "m" : "x");
    }
  }

  add("decision_maker", input.hasDecisionMaker ? weights.decision_maker! : 0, input.hasDecisionMaker ? "Target role found on a public page" : "No matching decision-maker published", input.hasDecisionMaker ? "s" : "x");
  add("verified_email", input.hasPublishedEmail ? weights.verified_email! : 0, input.hasPublishedEmail ? "Published work email found" : "No published email", input.hasPublishedEmail ? "s" : "x");
  add("verified_phone", input.hasPublishedPhone ? weights.verified_phone! : 0, input.hasPublishedPhone ? "Published phone found" : "No published phone", input.hasPublishedPhone ? "s" : "x");

  const wantWebsite = valuesOf(input.criteria, "website_required").some(Boolean);
  if (wantWebsite) {
    add("criteria_match", input.hasWebsite ? weights.criteria_match! : 0, input.hasWebsite ? "Website present" : "Website missing", input.hasWebsite ? "m" : "x");
  } else if (input.hasWebsite) {
    add("criteria_match", weights.criteria_match! * 0.5, "Website present");
  }

  const wantWeak = valuesOf(input.criteria, "website_weak").some(Boolean);
  if (wantWeak || input.websiteWeak) {
    add("website_weak", input.websiteWeak ? weights.website_weak! : 0, input.websiteWeak ? "Website quality flags present" : "No website-weakness signal", input.websiteWeak ? "s" : undefined);
  }

  const hireW = input.hiringLevel === "HIRING_CONFIRMED" ? 1 : input.hiringLevel === "HIRING_INDICATED" ? 0.35 : input.hiringLevel === "HIRING_HISTORICAL" ? 0.15 : input.hasHiring ? 0.35 : 0;
  if (hireW > 0) add("hiring", weights.hiring! * hireW, input.hiringLevel === "HIRING_CONFIRMED" ? "Confirmed public job listing" : "Hiring indicated, not confirmed", "s");
  if (input.hasProcurement) add("procurement", weights.procurement!, "Public procurement notice matched", "s");
  if (input.hasFunding) add("funding", weights.funding!, "Funding signal", "s");
  if (input.hasExpansion) add("expansion", weights.expansion!, "Expansion/investment language", "s");
  if (input.hasProjects) add("projects", weights.projects!, "Project/reference pages", "s");

  if (input.lastVerifiedAt) {
    const days = (Date.now() - new Date(input.lastVerifiedAt).getTime()) / 86400000;
    const freshness = days <= 30 ? weights.freshness! : days <= 90 ? weights.freshness! * 0.7 : weights.freshness! * 0.3;
    add("freshness", freshness, `Last verified ${Math.round(days)}d ago`);
  }

  if (input.sourceReliabilityAvg != null && Number.isFinite(input.sourceReliabilityAvg)) {
    const rel = Math.max(0, Math.min(100, input.sourceReliabilityAvg)) / 100;
    add("source_reliability", weights.source_reliability! * rel, `Mean source reliability ${Math.round(rel * 100)}`);
  }

  const totalW = parts.reduce((a, p) => a + p.weight, 0);
  const earned = parts.reduce((a, p) => a + p.earned, 0);
  let score = totalW > 0 ? clamp((earned / totalW) * 100) : 0;
  if (parts.length === 0) {
    uncertain.push("No evaluated scoring inputs");
    score = 0;
  }
  if (input.confidenceFloor && score < input.confidenceFloor) {
    missed.push(`Score ${score} is below confidence threshold ${input.confidenceFloor}`);
  }
  return { score, matched, missed, signals, uncertain, parts };
}

export function explanationText(b: ScoreBreakdown): string {
  const lines = [
    `Score ${b.score}/100`,
    b.matched.length ? `Matched: ${b.matched.join("; ")}` : "Matched: none",
    b.missed.length ? `Not matched: ${b.missed.join("; ")}` : null,
    b.signals.length ? `Signals: ${b.signals.join("; ")}` : null,
    b.uncertain.length ? `Uncertain: ${b.uncertain.join("; ")}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
