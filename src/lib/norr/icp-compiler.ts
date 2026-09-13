import { interpretTargetPrompt } from "./targeting/parser.ts";
import { emptyCriteria, valuesOf } from "./criteria.ts";
import type { SearchCriteria } from "./types.ts";
import type { TargetSpec } from "./targeting/spec.ts";
import { offerFamilyFromText, type OfferFamily } from "./role-relevance.ts";
import { validateSearchIntent, type QueryIssue } from "./query-validation.ts";
import { diagnoseTargetQuery, type QueryDiagnostics } from "./query-diagnostics.ts";
import { planSources, type SourcePlan } from "./source-planner.ts";

export type CriterionOrigin = "USER_EXPLICIT" | "AI_DERIVED" | "SYSTEM_DEFAULT";

export type CompiledCriterion = {
  id: string;
  criterion: string;
  value: string;
  origin: CriterionOrigin;
  reason: string;
  confidence: number;
  supported: boolean;
  editable: boolean;
};

export type IcpCompilation = {
  offerFamily: OfferFamily;
  userText: string;
  spec: TargetSpec;
  criteria: SearchCriteria;
  summary: string[];
  diagnostics: QueryDiagnostics;
  criteriaList: CompiledCriterion[];
  unsupported: CompiledCriterion[];
  issues: QueryIssue[];
  sourcePlan: SourcePlan;
  beginnerPrompt: string | null;
};

const EMPLOYEE_RE =
  /(?:työntekij(?:ää|än|iä)?|employees?|henkilöstö(?:ä|n)?|henkeä)\s*(?:noin|about)?\s*(\d{1,4})\s*[-–to]+\s*(\d{1,4})|(\d{1,4})\s*[-–to]+\s*(\d{1,4})\s*(?:työntekij|employee|henkilöst|henkeä)/i;

export function extractEmployeeRange(text: string): { min: number; max: number } | null {
  const m = text.match(EMPLOYEE_RE);
  if (!m) return null;
  const min = Number(m[1] ?? m[3]);
  const max = Number(m[2] ?? m[4]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return null;
  if (max > 100_000) return null;
  return { min, max };
}

function add(
  list: CompiledCriterion[],
  row: Omit<CompiledCriterion, "id"> & { id?: string },
): void {
  list.push({ id: row.id ?? `c${list.length + 1}`, ...row });
}

export function compileIcp(userText: string, base?: SearchCriteria): IcpCompilation {
  const text = String(userText ?? "").trim();
  const interpreted = interpretTargetPrompt(text, base ?? emptyCriteria());
  const criteria = interpreted.criteria;
  const spec = interpreted.spec;
  const offerFamily = offerFamilyFromText(text);
  const list: CompiledCriterion[] = [];

  if (criteria.country) {
    add(list, {
      criterion: "country",
      value: criteria.country,
      origin: /suom|finland|finnish|\bfi\b/i.test(text) ? "USER_EXPLICIT" : "SYSTEM_DEFAULT",
      reason: "Geographic market from the description, otherwise Finland as the product core.",
      confidence: 95,
      supported: true,
      editable: true,
    });
  }

  const city = valuesOf(criteria, "municipality")[0];
  if (city) {
    add(list, {
      criterion: "location",
      value: String(city),
      origin: "USER_EXPLICIT",
      reason: "Named municipality in the prompt.",
      confidence: 90,
      supported: true,
      editable: true,
    });
  }

  if (spec.industry?.codes?.length) {
    add(list, {
      criterion: "industry",
      value: spec.industry.codes.join(", "),
      origin: "AI_DERIVED",
      reason: "Mapped from business language to official TOL codes. Editable if the mapping is wrong.",
      confidence: 72,
      supported: true,
      editable: true,
    });
  }

  if (spec.financial?.revenue) {
    const r = spec.financial.revenue;
    add(list, {
      criterion: "revenue",
      value: `${r.min ?? "…"}–${r.max ?? "…"} (unknown=${r.unknown ?? "exclude"})`,
      origin: "USER_EXPLICIT",
      reason: "Published revenue range. Companies without filings are excluded unless the user allowed unknown.",
      confidence: 88,
      supported: true,
      editable: true,
    });
  }

  const dealMatch = text.match(/(\d[\d\s]{1,12})\s*[-–—to]+\s*(\d[\d\s]{1,12})\s*(?:€|eur)/i);
  const dealLooksLikeProject = /projekti|project|deal|sopimus|erp/i.test(text);
  if (dealMatch && dealLooksLikeProject && !spec.financial?.revenue) {
    add(list, {
      criterion: "typical_deal_size",
      value: `${dealMatch[1]}–${dealMatch[2]} €`,
      origin: "USER_EXPLICIT",
      reason: "This is the user's typical project value, not the target company's revenue. It is not used as a revenue filter.",
      confidence: 80,
      supported: false,
      editable: true,
    });
  }

  const employees = extractEmployeeRange(text);
  if (employees) {
    add(list, {
      criterion: "employees",
      value: `${employees.min}–${employees.max}`,
      origin: "USER_EXPLICIT",
      reason: "Headcount is not published in YTJ. Kept as an unsupported criterion rather than a fake filter.",
      confidence: 70,
      supported: false,
      editable: true,
    });
  }

  if (spec.hiring?.active) {
    add(list, {
      criterion: "hiring",
      value: "confirmed public listings preferred",
      origin: "USER_EXPLICIT",
      reason: "Hiring must be confirmed by a job listing. Website language is only indicated.",
      confidence: 84,
      supported: true,
      editable: true,
    });
  }

  if (spec.website?.highOpportunity || spec.website?.qualityScore) {
    add(list, {
      criterion: "website_opportunity",
      value: "measured public-page issues",
      origin: /huono|heikko|outdated|weak/.test(text) ? "USER_EXPLICIT" : "AI_DERIVED",
      reason: "Website opportunity uses crawled technical facts, not an aesthetic score.",
      confidence: 75,
      supported: true,
      editable: true,
    });
  }

  if (/b2b|yrityksille|companies|toisiin yrityksiin/i.test(text)) {
    add(list, {
      criterion: "customer_type",
      value: "b2b",
      origin: "AI_DERIVED",
      reason: "Selling to companies. Not a hard register filter.",
      confidence: 60,
      supported: false,
      editable: true,
    });
  }

  const decision =
    offerFamily === "erp"
      ? "CEO / CIO / COO / production"
      : offerFamily === "website" || offerFamily === "seo" || offerFamily === "marketing"
        ? "CEO / marketing / commercial"
        : offerFamily === "recruitment"
          ? "CEO / HR"
          : "CEO / commercial";
  add(list, {
    criterion: "decision_makers",
    value: decision,
    origin: "AI_DERIVED",
    reason: "Suggested contact roles for this offer. Only published people are shown.",
    confidence: 55,
    supported: true,
    editable: true,
  });

  const unsupported = list.filter((c) => !c.supported);
  const sourcePlan = planSources({
    country: criteria.country,
    businessId: "placeholder",
    target: spec,
    criteria,
    depth: criteria.depth,
  });
  const diagnostics = interpreted.diagnostics ?? diagnoseTargetQuery(text, spec, interpreted.summary);
  if (unsupported.length) {
    for (const u of unsupported) {
      if (!diagnostics.unsupported.includes(u.reason)) diagnostics.unsupported.push(u.reason);
    }
  }
  const issues = validateSearchIntent({ spec, criteria, unsupported: diagnostics.unsupported });

  return {
    offerFamily,
    userText: text,
    spec,
    criteria,
    summary: interpreted.summary,
    diagnostics,
    criteriaList: list,
    unsupported,
    issues,
    sourcePlan,
    beginnerPrompt: text || null,
  };
}

export const BEGINNER_QUESTIONS = [
  { id: "sell", fi: "Mitä myyt?", en: "What do you sell?" },
  { id: "buyer", fi: "Kuka sen yleensä ostaa?", en: "Who usually buys it?" },
  { id: "value", fi: "Tyypillinen asiakkuuden arvo?", en: "Typical customer value?" },
  { id: "where", fi: "Missä myyt?", en: "Where do you sell?" },
  { id: "good", fi: "Mikä tekee yrityksestä hyvän asiakkaan?", en: "What makes a company a good customer?" },
] as const;

export function compileBeginnerAnswers(answers: Record<string, string>): IcpCompilation {
  const blob = [answers.sell, answers.buyer, answers.value, answers.where, answers.good].filter(Boolean).join(". ");
  return compileIcp(blob);
}
