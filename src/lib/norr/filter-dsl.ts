import type { CriteriaField, CriteriaGroup, Criterion, SearchCriteria } from "./types.ts";
import { tightenCriteria, validateCriteria } from "./criteria.ts";
import { compileIcp } from "./icp-compiler.ts";

const MAX_RULES = 40;
const MAX_DEPTH = 4;
const ALLOWED_FIELDS = new Set<CriteriaField>([
  "country", "municipality", "postal_code", "radius", "industry", "keyword",
  "employee_min", "employee_max", "revenue_min", "revenue_max", "profitable", "growth",
  "founded_from", "founded_to", "legal_form", "active_only", "website_required",
  "website_tech", "website_weak", "ecommerce", "hiring", "expansion", "construction_signals",
  "procurement", "role", "contact_email", "contact_phone", "freshness_days", "confidence_min",
  "business_id",
]);
const ALLOWED_OPS = new Set(["eq", "neq", "contains", "gte", "lte", "in", "exists", "within_km"]);
const SQLISH = /;\s*(drop|union|insert|delete|update|select)\b|--|\/\*|\*\//i;

export function looksLikeCodeInjection(value: string): boolean {
  return /ignore previous instructions|union select|drop table|;\s*drop\b/i.test(value);
}

function walk(
  group: CriteriaGroup,
  depth: number,
  acc: Criterion[],
): { ok: true } | { ok: false; error: string } {
  if (depth > MAX_DEPTH) return { ok: false, error: "Filters nested too deep" };
  if (!group || !Array.isArray(group.rules)) return { ok: false, error: "Invalid filter group" };
  for (const rule of group.rules) {
    if (rule && "rules" in rule) {
      const inner = walk(rule, depth + 1, acc);
      if (!inner.ok) return inner;
      continue;
    }
    if (!rule || !ALLOWED_FIELDS.has(rule.field)) return { ok: false, error: "Unknown filter field" };
    if (!ALLOWED_OPS.has(rule.op)) return { ok: false, error: "Unknown filter operator" };
    const v = rule.value;
    if (typeof v === "string" && (SQLISH.test(v) || looksLikeCodeInjection(v))) {
      return { ok: false, error: "Filter value was rejected" };
    }
    if (Array.isArray(v) && v.some((x) => SQLISH.test(String(x)))) {
      return { ok: false, error: "Filter value was rejected" };
    }
    acc.push(rule);
  }
  return { ok: true };
}

export function compileCriteria(c: SearchCriteria): { ok: true; criteria: SearchCriteria } | { ok: false; error: string } {
  if (!c || typeof c !== "object") return { ok: false, error: "Invalid criteria" };
  if (!c.groups) return { ok: false, error: "Missing filter group" };
  const collected: Criterion[] = [];
  const walked = walk(c.groups, 0, collected);
  if (!walked.ok) return walked;
  if (collected.length > MAX_RULES) return { ok: false, error: "Too many filter rules" };
  if (typeof c.prompt === "string" && c.prompt.length > 2000) {
    c.prompt = c.prompt.slice(0, 2000);
  }
  if (c.depth && c.depth !== "normal" && c.depth !== "deep") {
    return { ok: false, error: "Unknown search depth" };
  }
  let next = tightenCriteria(c);
  const prompt = String(next.prompt ?? "").trim();
  if (prompt) {
    const icp = compileIcp(prompt, next);
    next = tightenCriteria({
      ...icp.criteria,
      prompt,
      maxResults: next.maxResults || icp.criteria.maxResults,
      depth: next.depth,
      mode: next.mode,
    });
  }
  const v = validateCriteria(next);
  if (!v.ok) return v;
  return { ok: true, criteria: next };
}

export const TARGET_PATHS = [
  "financial.revenue",
  "financial.profit",
  "financial.employees",
  "industry.codes",
  "geo.municipality",
  "website.highOpportunity",
  "hiring.active",
] as const;
