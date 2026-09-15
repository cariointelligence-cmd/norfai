/** Hive Nerve: one execution order every search engine follows. */
import { planSearch, type SearchPlan } from "./search-orchestrator.ts";
import type { SearchCriteria } from "./types.ts";
import { hiveMeshSize, hiveMeshSnapshot, hiveSelectEngines } from "./hive-mesh.ts";
import { valuesOf } from "./criteria.ts";

export const HIVE_ENGINE_ORDER = [
  "planner",
  "discover",
  "cheap_qualify",
  "contacts",
  "directories",
  "identity",
  "financial",
  "signals",
  "score",
] as const;
export type HiveEngine = (typeof HIVE_ENGINE_ORDER)[number];

export { hiveMeshSize, hiveSelectEngines, hiveMeshSnapshot };

export function hivePlan(opts: {
  criteria?: SearchCriteria;
  depth?: "normal" | "deep";
  country?: string | null;
}): SearchPlan {
  return planSearch({
    criteria: opts.criteria,
    target: opts.criteria?.target,
    depth: opts.depth,
    country: opts.country,
  });
}

export function hiveSkipIdentity(opts: { depth?: string | null; emailRecovery?: boolean }): boolean {
  return !opts.emailRecovery && opts.depth !== "deep";
}

export function hiveSkipFinancial(plan: SearchPlan): boolean {
  return plan.engines.financial === "skip";
}

export function hiveSkipSignals(plan: SearchPlan): boolean {
  return plan.engines.signals === "skip";
}

export const HIVE_JOB_RANK: Record<string, number> = {
  discover: 0,
  email: 1,
  enrich: 2,
  scrape: 3,
  score: 4,
  crawl: 5,
  signals: 6,
};

/** Nerve order: fill the register before contact jobs, never starve discover. */
export function hiveJobRank(type: string | null | undefined): number {
  return HIVE_JOB_RANK[String(type ?? "")] ?? 8;
}

export function hiveSkipJob(type: string, plan: SearchPlan): boolean {
  if (type === "signals" && hiveSkipSignals(plan)) return true;
  return false;
}

function firstIndustry(criteria?: SearchCriteria): string | null {
  if (!criteria) return null;
  try {
    const v = valuesOf(criteria, "industry")[0];
    return v != null ? String(v) : null;
  } catch {
    return criteria.target?.industry?.codes?.[0] ?? null;
  }
}

export function hiveSourceReport(plan: SearchPlan, opts?: { country?: string | null; criteria?: SearchCriteria }) {
  const country = opts?.country ?? (typeof opts?.criteria?.country === "string" ? opts.criteria.country : "FI");
  const mesh = hiveMeshSnapshot({
    country,
    industry: firstIndustry(opts?.criteria),
    preset: typeof opts?.criteria?.preset === "string" ? opts.criteria.preset : null,
  });
  return {
    source: "search_plan",
    ok: true,
    engines: plan.engines,
    mandatory: plan.mandatory,
    preferred: plan.preferred,
    reasons: [...plan.reasons, `Hive mesh ${mesh.catalogSize} engines · selected ${mesh.selected} · no full fan-out`],
    stages: plan.stages,
    hive: mesh,
  };
}
