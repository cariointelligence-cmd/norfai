import type { TargetSpec } from "./targeting/spec.ts";

export type QueryDiagnostics = {
  parsed: string[];
  supported: string[];
  unsupported: string[];
  unknown: string[];
};

export function diagnoseTargetQuery(prompt: string, spec: TargetSpec, summary: string[]): QueryDiagnostics {
  const text = String(prompt ?? "");
  const parsed = [...summary];
  const supported: string[] = [];
  const unsupported: string[] = [];
  const unknown: string[] = [];

  if (spec.financial?.revenue) supported.push("Published revenue range (official filings when available)");
  if (spec.financial?.profitable != null) supported.push("Published profitability");
  if (spec.financial?.equityRatio) supported.push("Equity ratio when official equity and assets exist");
  if (spec.hiring?.active) supported.push("Hiring (job listings preferred over website language)");
  if (spec.industry?.codes?.length) supported.push("Industry codes");
  if (spec.website?.highOpportunity || spec.website?.qualityScore) supported.push("Public website quality from crawled HTML");
  if (spec.advertising?.meta) supported.push("Advertising pixels on the public site (not spend)");
  if (spec.company?.ageYears) supported.push("Company age from registration date");
  if (spec.tech?.hasChat != null) supported.push("Public chatbot presence");
  if (spec.tech?.hasEcommerce) supported.push("Ecommerce markers on the public site");

  if (/traffic|kävijä|visitor count|page ?views/i.test(text)) {
    unsupported.push("Website traffic data is not available. That criterion was not evaluated.");
  }
  if (/marketing team|markkinointitiimi/i.test(text)) {
    unsupported.push("Internal marketing-team size is not published and is not used as a filter.");
  }
  if (/ad spend|mainosbudjet|monthly spend/i.test(text)) {
    unsupported.push("Advertising spend is not observed. Only on-site pixels can be detected.");
  }
  if (/työntekij|employee count|headcount|henkilöstömäär/i.test(text)) {
    unsupported.push("Employee count is not published in YTJ and is not used as a hard filter.");
  }

  if (spec.financial?.revenue && spec.financial.revenue.unknown === "exclude") {
    unknown.push("Companies without published financials are excluded from this search.");
  } else if (spec.financial?.revenue && spec.financial.revenue.unknown === "allow") {
    unknown.push("Companies without published financials stay in the list and are marked unknown.");
  }

  return { parsed, supported, unsupported, unknown };
}
