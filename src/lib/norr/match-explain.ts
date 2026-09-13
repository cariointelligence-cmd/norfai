import type { CompanyIntel } from "./targeting/scores.ts";
import type { HiringLevel } from "./hiring-signal.ts";
import type { SalesBrief } from "./sales-brief.ts";

export type ExplanationBucket = "MATCHED_FACTS" | "MATCHED_SIGNALS" | "INFERENCES" | "UNKNOWN" | "CONFLICTING";

export type MatchExplanation = {
  matchedFacts: string[];
  matchedSignals: string[];
  inferences: string[];
  unknown: string[];
  conflicting: string[];
};

export function explainMatch(opts: {
  intel?: CompanyIntel | null;
  hiringLevel?: HiringLevel;
  brief?: SalesBrief | null;
}): MatchExplanation {
  const intel = opts.intel ?? null;
  const matchedFacts = [...(intel?.match?.matched ?? [])];
  const unknown = [...(intel?.match?.unknown ?? [])];
  const conflicting = [...(intel?.match?.missed ?? []), ...(intel?.match?.conflictingFields ?? []).map((f) => `Conflict on ${f}`)];
  const matchedSignals: string[] = [];
  const inferences: string[] = [];

  if (opts.hiringLevel === "HIRING_CONFIRMED") matchedSignals.push("Confirmed public job listing");
  else if (opts.hiringLevel === "HIRING_INDICATED") {
    matchedSignals.push("Hiring language on the company website");
    inferences.push("Website hiring language is not confirmed company growth.");
  } else if (opts.hiringLevel === "HIRING_HISTORICAL") {
    matchedSignals.push("Job listing is outside the freshness window");
  }

  if (intel?.website?.likelyWeak) {
    matchedSignals.push("Public website quality flags are present");
    inferences.push("A weak public site can be an outreach angle. It is not proof of budget.");
  }
  if (intel?.growth?.band && intel.growth.evidence.some((e) => /YoY/i.test(e))) {
    matchedFacts.push(`Financial growth band ${intel.growth.band}`);
  }
  if (opts.brief) {
    for (const s of opts.brief.signals) if (!matchedSignals.includes(s)) matchedSignals.push(s);
    for (const i of opts.brief.inferences) if (!inferences.includes(i)) inferences.push(i);
    for (const u of opts.brief.unknown) if (!unknown.includes(u)) unknown.push(u);
  }
  return { matchedFacts, matchedSignals, inferences, unknown, conflicting };
}

export type RejectionReason = {
  code: "REVENUE_UNAVAILABLE" | "REVENUE_OUT_OF_RANGE" | "WRONG_INDUSTRY" | "HIRING_NOT_CONFIRMED" | "OTHER";
  detail: string;
};

export function classifyRejection(missed: string[]): RejectionReason[] {
  return missed.map((m) => {
    if (/revenue unknown/i.test(m)) return { code: "REVENUE_UNAVAILABLE" as const, detail: m };
    if (/revenue .*outside/i.test(m)) return { code: "REVENUE_OUT_OF_RANGE" as const, detail: m };
    if (/industry|specialization/i.test(m)) return { code: "WRONG_INDUSTRY" as const, detail: m };
    if (/hiring/i.test(m)) return { code: "HIRING_NOT_CONFIRMED" as const, detail: m };
    return { code: "OTHER" as const, detail: m };
  });
}
