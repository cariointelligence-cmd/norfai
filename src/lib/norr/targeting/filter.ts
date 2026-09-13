import type { SearchCriteria } from "../types.ts";
import { targetHasConstraint } from "./spec.ts";
import type { CompanyIntel } from "./scores.ts";
import { matchTarget, passesHardTarget } from "./scores.ts";

export function evaluateCompanyTarget(intel: Omit<CompanyIntel, "match">, criteria: SearchCriteria): CompanyIntel["match"] {
  return matchTarget(intel, criteria.target);
}

export function shouldRejectForTarget(intel: CompanyIntel, criteria: SearchCriteria): string | null {
  if (!targetHasConstraint(criteria.target)) return null;
  if (passesHardTarget(intel.match)) return null;
  if (!intel.match.missed.length) return null;
  return intel.match.missed.join("; ");
}

export const SORT_KEYS = [
  "match",
  "commercial",
  "website",
  "seo",
  "digital",
  "ads",
  "age",
  "revenue",
  "opportunity",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
