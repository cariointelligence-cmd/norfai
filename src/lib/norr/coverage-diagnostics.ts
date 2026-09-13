export type EmptyResultCode =
  | "NO_MARKET_MATCH"
  | "INSUFFICIENT_DATA"
  | "SOURCE_FAILURE"
  | "UNSUPPORTED_FILTER"
  | "OVERLY_RESTRICTIVE"
  | "FILTER_EXCLUDED_ALL";

export type CoverageCounts = {
  candidates: number;
  returned: number;
  rejectedRevenueUnknown: number;
  rejectedRevenueRange: number;
  rejectedIndustry: number;
  rejectedHiring: number;
  rejectedOther: number;
  sourceFailed: boolean;
  unsupported: string[];
};

export type CoverageDiagnosis = {
  code: EmptyResultCode | "OK";
  headline: string;
  detail: string;
};

export function diagnoseCoverage(c: CoverageCounts): CoverageDiagnosis {
  if (c.sourceFailed && c.returned === 0 && c.candidates === 0) {
    return {
      code: "SOURCE_FAILURE",
      headline: "A required register did not respond.",
      detail: "The search did not fail the market — the source was unavailable. Try again shortly.",
    };
  }
  if (c.unsupported.length && c.returned === 0 && c.candidates === 0) {
    return {
      code: "UNSUPPORTED_FILTER",
      headline: "This filter cannot be evaluated with current sources.",
      detail: c.unsupported[0]!,
    };
  }
  if (c.candidates === 0 && c.returned === 0) {
    return {
      code: "NO_MARKET_MATCH",
      headline: "No companies matched the register query.",
      detail: "Industry, location or legal form produced no official hits. Broaden those first.",
    };
  }
  const excluded = c.rejectedRevenueUnknown + c.rejectedRevenueRange + c.rejectedIndustry + c.rejectedHiring + c.rejectedOther;
  if (c.returned === 0 && excluded > 0) {
    if (c.rejectedRevenueUnknown >= excluded * 0.5) {
      return {
        code: "INSUFFICIENT_DATA",
        headline: "Candidates existed, but published financials were missing.",
        detail: `${c.candidates} candidates found, ${c.rejectedRevenueUnknown} excluded because confirmed revenue was unavailable.`,
      };
    }
    return {
      code: "FILTER_EXCLUDED_ALL",
      headline: "Every candidate failed a required filter.",
      detail: describeExclusions(c),
    };
  }
  if (c.returned > 0 && c.returned < 8 && excluded > c.returned) {
    return {
      code: "OVERLY_RESTRICTIVE",
      headline: "Few companies passed the strict filters.",
      detail: describeExclusions(c),
    };
  }
  return {
    code: "OK",
    headline: "",
    detail: "",
  };
}

function describeExclusions(c: CoverageCounts): string {
  const bits: string[] = [];
  if (c.rejectedRevenueUnknown) bits.push(`${c.rejectedRevenueUnknown} without published revenue`);
  if (c.rejectedRevenueRange) bits.push(`${c.rejectedRevenueRange} outside the revenue range`);
  if (c.rejectedHiring) bits.push(`${c.rejectedHiring} without a confirmed job listing`);
  if (c.rejectedIndustry) bits.push(`${c.rejectedIndustry} wrong industry`);
  if (c.rejectedOther) bits.push(`${c.rejectedOther} other required misses`);
  return `${c.candidates} candidates. ${bits.join("; ") || "Filters removed the rest."}.`;
}

export function tallyRejection(detail: string | null | undefined): keyof Pick<
  CoverageCounts,
  "rejectedRevenueUnknown" | "rejectedRevenueRange" | "rejectedIndustry" | "rejectedHiring" | "rejectedOther"
> {
  const t = detail ?? "";
  if (/revenue unknown/i.test(t)) return "rejectedRevenueUnknown";
  if (/revenue .*outside/i.test(t)) return "rejectedRevenueRange";
  if (/hiring/i.test(t)) return "rejectedHiring";
  if (/industry|specialization/i.test(t)) return "rejectedIndustry";
  return "rejectedOther";
}
