/**
 * Search orchestrator v2. One plan for all engines.
 * USER QUERY → ICP → required/optional engines → cheap filter → enrich → rank
 */
import { valuesOf } from "./criteria.ts";
import type { SearchCriteria } from "./types.ts";
import type { TargetSpec } from "./targeting/spec.ts";
import type { CompanyCapability } from "./engine-contract.ts";
import { planSources, type SourcePlan } from "./source-planner.ts";

export const SEARCH_STAGES = ["DISCOVER", "CHEAP_QUALIFY", "CORE_SALES", "DEEP"] as const;
export type SearchStage = (typeof SEARCH_STAGES)[number];

export type EngineNeed = "required" | "preferred" | "skip";

export type SearchPlan = {
  stages: SearchStage[];
  engines: Record<CompanyCapability, EngineNeed>;
  sourcePlan: SourcePlan;
  mandatory: string[];
  preferred: string[];
  reasons: string[];
};

function wants(criteria: SearchCriteria | undefined, key: string): boolean {
  if (!criteria?.groups) return false;
  try {
    return valuesOf(criteria, key).some((v) => v !== null && v !== undefined && v !== false && v !== "");
  } catch {
    return false;
  }
}

export function planSearch(opts: {
  criteria?: SearchCriteria;
  target?: TargetSpec;
  depth?: "normal" | "deep";
  country?: string | null;
}): SearchPlan {
  const c = opts.criteria;
  const t = opts.target;
  const deep = opts.depth === "deep";
  const financial = Boolean(
    t?.financial?.revenue?.min != null
    || t?.financial?.revenue?.max != null
    || wants(c, "revenue_min")
    || wants(c, "revenue_max"),
  );
  const hiring = Boolean(t?.hiring?.active || wants(c, "hiring"));
  const website = Boolean(t?.website || wants(c, "website_weak") || wants(c, "has_website"));
  const tech = Boolean(t?.technology?.length);
  const sourcePlan = planSources({
    country: opts.country ?? (typeof c?.country === "string" ? c.country : "FI"),
    target: t,
    depth: opts.depth,
    criteria: c?.groups ? c : undefined,
  });
  const engines: Record<CompanyCapability, EngineNeed> = {
    identity: "required",
    website: "required",
    email: "required",
    phone: "required",
    decisionMaker: "preferred",
    financial: financial ? "required" : "skip",
    technology: tech || deep ? (tech ? "required" : "preferred") : "skip",
    websiteAnalysis: website || deep ? "preferred" : "skip",
    signals: hiring || wants(c, "procurement") || deep ? (hiring ? "required" : "preferred") : "skip",
  };
  const mandatory: string[] = ["identity"];
  if (wants(c, "industry") || t?.industry?.codes?.length) mandatory.push("industry");
  if (wants(c, "country") || opts.country) mandatory.push("country");
  if (financial) mandatory.push("financial");
  const preferred: string[] = ["email", "phone", "decisionMaker"];
  const reasons = [
    ...sourcePlan.reasons,
    "Contacts run in CORE_SALES before optional deep intelligence",
    financial ? "Financial engine required — UNKNOWN revenue is not a match" : "Financial engine skipped",
  ];
  return {
    stages: deep ? ["DISCOVER", "CHEAP_QUALIFY", "CORE_SALES", "DEEP"] : ["DISCOVER", "CHEAP_QUALIFY", "CORE_SALES"],
    engines,
    sourcePlan,
    mandatory,
    preferred,
    reasons,
  };
}

export function eligibleMatch(opts: {
  matchScore?: number | null;
  recordStatus?: string | null;
  name?: string | null;
  rejected?: boolean;
}): boolean {
  if (!opts.name?.trim()) return false;
  if (opts.rejected) return false;
  const st = String(opts.recordStatus ?? "");
  if (st === "rejected" || st === "excluded" || st === "failed") return false;
  return Number(opts.matchScore ?? 0) > 0;
}

export function emptyEmailExportValue(classification?: string | null, value?: string | null): string {
  if (value && String(value).includes("@")) return value;
  if (classification === "inferred") return "";
  return "UNKNOWN";
}
