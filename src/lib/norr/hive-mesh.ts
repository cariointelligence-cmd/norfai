/**
 * Hive mesh: one shared-model catalog of combinatorial engines.
 * Addressable size is 270k+. Hive never fans out to all of them.
 * It picks a tiny ICP-relevant subset and they share one evidence model.
 */
import { INDUSTRIES } from "./finland.ts";
import { nationOf, type Nation } from "./countries/env.ts";
import { fleetFor, fleetCounts } from "./sources/nation-fleet.ts";
import { OPPORTUNITY_PRESETS, type OpportunityPresetId } from "./targeting/spec.ts";
import { intelEngineIds } from "./vercel-intel.ts";

export const HIVE_NATIONS: Nation[] = ["FI", "SE", "NO"];
export const HIVE_CONTACT_MODES = ["email", "phone", "decision_maker"] as const;
export type HiveContactMode = (typeof HIVE_CONTACT_MODES)[number];

export const HIVE_OPPORTUNITIES = Object.keys(OPPORTUNITY_PRESETS) as OpportunityPresetId[];

/** Pad to ≥150 industry keys so the combinatorial catalog stays dense. */
export function hiveIndustryKeys(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of INDUSTRIES) {
    const c = String(row.code ?? "").trim();
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  for (let i = 1; i <= 99 && out.length < 150; i++) {
    const c = String(i).padStart(2, "0");
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function hiveMeshSize(): number {
  const fleets = fleetCounts();
  const industries = Math.max(150, hiveIndustryKeys().length);
  const opps = HIVE_OPPORTUNITIES.length;
  const modes = HIVE_CONTACT_MODES.length;
  const crawlers = fleets.FI + fleets.SE + fleets.NO;
  const serverless = intelEngineIds().length * HIVE_NATIONS.length * industries;
  return crawlers * industries * opps * modes + serverless;
}

export function hiveEngineId(opts: {
  nation: Nation;
  industry: string;
  opportunity: string;
  crawler: string;
  mode: HiveContactMode;
}): string {
  return `${opts.nation.toLowerCase()}:${opts.industry}:${opts.opportunity}:${opts.crawler}:${opts.mode}`;
}

export type HiveSelectInput = {
  country?: string | null;
  industry?: string | null;
  preset?: string | null;
  missing: { email: boolean; phone: boolean; people: boolean };
  emailRecovery?: boolean;
  depth?: string | null;
};

export type HiveSelect = {
  catalogSize: number;
  nation: Nation;
  industry: string;
  opportunity: string;
  modes: HiveContactMode[];
  crawlerIds: string[];
  selected: string[];
  limit: number;
  parallel: number;
  budgetMs: number;
  skipFleet: boolean;
  reason: string;
};

function industryKey(raw?: string | null): string {
  const v = String(raw ?? "").replace(/\D/g, "");
  if (!v) return "all";
  return v.slice(0, 5);
}

function opportunityKey(raw?: string | null): OpportunityPresetId {
  if (raw && raw in OPPORTUNITY_PRESETS) return raw as OpportunityPresetId;
  return "website_sales";
}

function modesWanted(missing: HiveSelectInput["missing"], recovery: boolean): HiveContactMode[] {
  const out: HiveContactMode[] = [];
  if (missing.email || recovery) out.push("email");
  if (missing.phone || recovery) out.push("phone");
  if (missing.people || recovery) out.push("decision_maker");
  return out.length ? out : ["email"];
}

export function hiveSelectEngines(opts: HiveSelectInput): HiveSelect {
  const catalogSize = hiveMeshSize();
  const nation = nationOf(opts.country);
  const industry = industryKey(opts.industry);
  const opportunity = opportunityKey(opts.preset);
  const nothingMissing = !opts.missing.email && !opts.missing.phone && !opts.missing.people;
  if (nothingMissing && !opts.emailRecovery) {
    return {
      catalogSize,
      nation,
      industry,
      opportunity,
      modes: [],
      crawlerIds: [],
      selected: [],
      limit: 0,
      parallel: 0,
      budgetMs: 0,
      skipFleet: true,
      reason: "CORE_SALES already has email+phone+people — fleet skipped",
    };
  }
  const modes = modesWanted(opts.missing, Boolean(opts.emailRecovery));
  const recovery = Boolean(opts.emailRecovery) || opts.depth === "deep";
  const limit = recovery ? 8 : opts.missing.email ? 6 : 4;
  const crawlers = fleetFor(nation)
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
  const crawlerIds = crawlers.map((c) => c.id);
  const selected = crawlerIds.flatMap((crawler) =>
    modes.map((mode) => hiveEngineId({ nation, industry, opportunity, crawler, mode })),
  );
  return {
    catalogSize,
    nation,
    industry,
    opportunity,
    modes,
    crawlerIds,
    selected,
    limit,
    parallel: Math.min(5, crawlerIds.length),
    budgetMs: recovery ? 2800 : 1600,
    skipFleet: false,
    reason: `Hive selected ${crawlerIds.length}/${catalogSize} engines for ${nation} ${industry} ${opportunity}`,
  };
}

export function hiveMeshSnapshot(opts: { country?: string | null; industry?: string | null; preset?: string | null }) {
  const pick = hiveSelectEngines({
    country: opts.country,
    industry: opts.industry,
    preset: opts.preset,
    missing: { email: true, phone: true, people: true },
  });
  return {
    catalogSize: pick.catalogSize,
    nation: pick.nation,
    selected: pick.crawlerIds.length,
    parallel: pick.parallel,
    budgetMs: pick.budgetMs,
    fanOutAll: false,
  };
}
