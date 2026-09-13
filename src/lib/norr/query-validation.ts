import type { TargetSpec } from "./targeting/spec.ts";
import type { SearchCriteria } from "./types.ts";
import { valuesOf } from "./criteria.ts";

export type QueryIssue = {
  code: "CONTRADICTORY" | "TOO_BROAD" | "UNSUPPORTED" | "LIKELY_ZERO";
  message: string;
  blocking: boolean;
};

export function validateSearchIntent(opts: {
  spec: TargetSpec;
  criteria: SearchCriteria;
  unsupported?: string[];
}): QueryIssue[] {
  const issues: QueryIssue[] = [];
  const rev = opts.spec.financial?.revenue;
  const employeesMin = Number(valuesOf(opts.criteria, "employee_min")[0] ?? NaN);
  const employeesMax = Number(valuesOf(opts.criteria, "employee_max")[0] ?? NaN);
  const legal = valuesOf(opts.criteria, "legal_form").map(String);
  const industry = opts.spec.industry?.codes ?? valuesOf(opts.criteria, "industry");
  const mun = valuesOf(opts.criteria, "municipality");

  if (rev?.min != null && rev.min >= 100_000_000 && Number.isFinite(employeesMax) && employeesMax > 0 && employeesMax <= 3) {
    issues.push({
      code: "CONTRADICTORY",
      message: "Revenue €100M+ with 1–3 employees is internally inconsistent. Confirm the intended size.",
      blocking: true,
    });
  }
  if (legal.some((l) => /toiminimi|tmi|sole/i.test(l)) && rev?.min != null && rev.min >= 5_000_000) {
    issues.push({
      code: "CONTRADICTORY",
      message: "Sole traders rarely publish multi-million revenue. The legal form and revenue range conflict.",
      blocking: true,
    });
  }
  const profitableFlags = valuesOf(opts.criteria, "profitable").map((v) => String(v).toLowerCase());
  if (profitableFlags.includes("true") && profitableFlags.includes("false")) {
    issues.push({ code: "CONTRADICTORY", message: "Profitability cannot be both required and forbidden.", blocking: true });
  }
  if (opts.unsupported?.length) {
    issues.push({
      code: "UNSUPPORTED",
      message: opts.unsupported[0]!,
      blocking: false,
    });
  }
  const tightFinancial = Boolean(rev && (rev.min != null || rev.max != null) && (rev.unknown ?? "exclude") === "exclude");
  if (tightFinancial) {
    issues.push({
      code: "LIKELY_ZERO",
      message: "Published financials cover only a minority of Finnish companies. Unknown filings will be excluded.",
      blocking: false,
    });
  }
  const noIndustry = !industry.length;
  const noPlace = !mun.length && !opts.criteria.country;
  if (noIndustry && noPlace && !tightFinancial && !opts.spec.hiring?.active) {
    issues.push({
      code: "TOO_BROAD",
      message: "Add an industry, location, or a published figure so the register query is bounded.",
      blocking: true,
    });
  }
  return issues;
}

export function blockingIssue(issues: QueryIssue[]): QueryIssue | null {
  return issues.find((i) => i.blocking) ?? null;
}
