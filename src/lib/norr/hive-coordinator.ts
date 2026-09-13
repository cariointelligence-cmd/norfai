/** Hive Nerve: one execution order every search engine follows. */
import { planSearch, type SearchPlan } from "./search-orchestrator.ts";
import type { SearchCriteria } from "./types.ts";

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

export function hiveSourceReport(plan: SearchPlan) {
  return {
    source: "search_plan",
    ok: true,
    engines: plan.engines,
    mandatory: plan.mandatory,
    preferred: plan.preferred,
    reasons: plan.reasons,
    stages: plan.stages,
  };
}
