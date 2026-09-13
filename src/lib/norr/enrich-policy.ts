/** Query-aware enrichment. Contacts and identity that already exist must not
 *  retrigger Wikidata/GLEIF/VIES/Nominatim on every search. */
import { CACHE_TTL_MS } from "./cache-policy.ts";
import { contactsSatisfied } from "./job-budget.ts";
import type { SourcePlan } from "./source-planner.ts";

export type EnrichSkip = {
  identity: boolean;
  gleif: boolean;
  vies: boolean;
  geo: boolean;
  linkedin: boolean;
  grok: boolean;
  harvest: boolean;
  reason: string;
};

export function planEnrichSkip(opts: {
  hasLei?: boolean;
  hasVat?: boolean;
  hasLat?: boolean;
  hasWebsite?: boolean;
  email?: string | null;
  phone?: string | null;
  people?: number | null;
  lastEnrichedAt?: number | null;
  financialRequired?: boolean;
  depth?: "normal" | "deep";
  sourcePlan?: SourcePlan | null;
  now?: number;
}): EnrichSkip {
  const satisfied = contactsSatisfied({
    email: opts.email,
    phone: opts.phone,
    people: opts.people,
  });
  const fresh = opts.lastEnrichedAt != null
    && ((opts.now ?? Date.now()) - opts.lastEnrichedAt) < CACHE_TTL_MS.contact;
  const deep = opts.depth === "deep";
  const identity = Boolean(satisfied && opts.hasWebsite && fresh && !opts.financialRequired && !deep);
  return {
    identity,
    gleif: identity || Boolean(opts.hasLei),
    vies: identity || !opts.hasVat,
    geo: identity || Boolean(opts.hasLat),
    linkedin: satisfied && !deep,
    grok: Boolean(opts.email) && !deep,
    harvest: satisfied && fresh && !deep,
    reason: identity
      ? "Fresh published contacts and website reused; identity sources skipped"
      : satisfied
        ? "Published contacts already present; optional people/LLM sources skipped"
        : "Full enrich required",
  };
}

export function sourceCallsSaved(skip: EnrichSkip): number {
  let n = 0;
  if (skip.identity) n += 1;
  if (skip.gleif) n += 1;
  if (skip.vies) n += 1;
  if (skip.geo) n += 1;
  if (skip.linkedin) n += 1;
  if (skip.grok) n += 1;
  if (skip.harvest) n += 3;
  return n;
}
