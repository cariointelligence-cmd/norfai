/**
 * Hive Cortex query plan for the register slice.
 * Must-clauses never relax. Homemade directories are routed, not fanned to every host.
 */
import type { SearchCriteria } from "../types.ts";
import { firstValue, valuesOf } from "../criteria.ts";
import { expandIndustryQueryCodes, wantsHousingIndustry } from "../finland.ts";
import { RUNTIME } from "../runtime.ts";
import {
  discoverQuerySeeds,
  isGenericDiscoverQuery,
  looksLikeCompanyName,
  needsOfficialIndustry,
} from "./register-gate.ts";

export const REGISTER_PARSER_VERSION = {
  ytj: "ytj_v3",
  finder: "1",
  kauppalehti: "1",
  northdata: "1",
  proff: "1",
  asiakastieto: "1",
  wikidata: "p3608",
  nominatim: "1",
  opencorporates: "1",
  brreg: "1",
  cvr: "1",
  bolagsverket: "1",
  companies_house: "1",
  gleif: "1",
} as const;

export const REGISTER_REASON_CODES = [
  "NO_MATCH",
  "SOURCE_UNAVAILABLE",
  "FORBIDDEN",
  "OUT_OF_COVERAGE",
  "PARTIAL",
  "FILTER_EXCLUDED_ALL",
] as const;

export type RegisterReasonCode = (typeof REGISTER_REASON_CODES)[number];

export type RegisterQueryPlan = {
  country: string;
  must: {
    industryCodes: string[];
    municipality: string | null;
    legalForms: string[];
    businessIds: string[];
    activeOnly: boolean;
    officialIndustry: boolean;
  };
  should: {
    keywords: string[];
    nameSeeds: string[];
    directorySeeds: string[];
  };
  mustNot: {
    housingUnlessRequested: boolean;
    genericQueries: boolean;
    previouslySeen: boolean;
  };
  official: string[];
  homemade: string[];
  federated: string[];
  evidenceMinimum: "official_industry" | "identity";
  budgetMs: number;
};

export type HomemadeDiscoverReport = {
  source: string;
  ok: boolean;
  hits: number;
  hydrated?: number;
  dropped?: number;
  excludedSeen?: number;
  error?: string;
  note?: string;
  code?: RegisterReasonCode;
  parserVersion?: string;
  skipped?: boolean;
};

export function isRegisterReasonCode(v: unknown): v is RegisterReasonCode {
  return typeof v === "string" && (REGISTER_REASON_CODES as readonly string[]).includes(v);
}

export function parseRegisterReasonNote(note: string | null | undefined): { code: RegisterReasonCode; text: string } | null {
  if (!note) return null;
  const m = String(note).match(
    /^(NO_MATCH|SOURCE_UNAVAILABLE|FORBIDDEN|OUT_OF_COVERAGE|PARTIAL|FILTER_EXCLUDED_ALL):\s*([\s\S]*)$/,
  );
  if (!m) return null;
  return { code: m[1] as RegisterReasonCode, text: (m[2] ?? "").trim() };
}

function isTransportFailure(error?: string, skipped?: boolean): boolean {
  if (skipped) return true;
  if (!error) return false;
  const e = error.toLowerCase();
  return !/no register hits|no distinctive|no match|no row that passed/.test(e);
}

const FI_DIRECTORIES = ["finder", "kauppalehti", "northdata", "proff", "asiakastieto"] as const;
const NAME_DIRECTORIES = ["opencorporates", "wikidata"] as const;

export function planRegisterQuery(criteria: SearchCriteria): RegisterQueryPlan {
  const country = (criteria.country || "FI").toUpperCase();
  const industryCodes = expandIndustryQueryCodes(valuesOf(criteria, "industry").map(String)).filter((c) => c.length >= 2);
  const municipality = String(firstValue(criteria, "municipality") ?? "").trim() || null;
  const legalForms = valuesOf(criteria, "legal_form").map(String);
  const businessIds = valuesOf(criteria, "business_id").map(String).filter(Boolean);
  const activeOnly = valuesOf(criteria, "active_only").some((v) => v === true || v === "true");
  const seeds = discoverQuerySeeds(criteria);
  const keywords = valuesOf(criteria, "keyword")
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && !isGenericDiscoverQuery(s));
  const nameSeeds = [...new Set([...seeds.filter(looksLikeCompanyName), ...keywords.filter(looksLikeCompanyName)])];
  const officialIndustry = needsOfficialIndustry(criteria);

  const official: string[] = [];
  const homemade: string[] = [];
  const federated: string[] = [];

  if (country === "FI") official.push("ytj");
  else if (country === "NO") official.push("brreg");
  else if (country === "DK") official.push("cvr");
  else if (country === "SE") official.push("bolagsverket");
  else if (country === "GB" || country === "UK") official.push("companies_house");

  if (country === "FI") {
    homemade.push(...FI_DIRECTORIES);
    if (municipality) homemade.push("nominatim");
  }
  if (country === "NO") homemade.push("brreg");
  if (country === "DK" && nameSeeds.length) homemade.push("cvr");
  if (country === "SE") homemade.push("bolagsverket");
  if (country === "GB" || country === "UK") homemade.push("companies_house");
  if (nameSeeds.length) homemade.push(...NAME_DIRECTORIES);
  if (nameSeeds.length) federated.push("gleif");

  return {
    country,
    must: {
      industryCodes,
      municipality,
      legalForms,
      businessIds,
      activeOnly,
      officialIndustry,
    },
    should: { keywords, nameSeeds, directorySeeds: seeds },
    mustNot: {
      housingUnlessRequested: !wantsHousingIndustry(industryCodes),
      genericQueries: true,
      previouslySeen: criteria.excludeSeen !== false,
    },
    official: unique(official),
    homemade: unique(homemade),
    federated: unique(federated),
    evidenceMinimum: officialIndustry ? "official_industry" : "identity",
    budgetMs: RUNTIME.discoverBudgetMs,
  };
}

export function routeHomemadeSources(plan: RegisterQueryPlan, disabled?: Set<string>): string[] {
  return plan.homemade.filter((id) => !disabled?.has(id));
}

export function createCircuit(limit = 2) {
  const fails = new Map<string, number>();
  return {
    ok(id: string) {
      return (fails.get(id) ?? 0) < limit;
    },
    fail(id: string) {
      fails.set(id, (fails.get(id) ?? 0) + 1);
    },
    success(id: string) {
      fails.set(id, 0);
    },
    tripped(id: string) {
      return (fails.get(id) ?? 0) >= limit;
    },
  };
}

export function diagnoseRegisterEmpty(
  plan: RegisterQueryPlan,
  report: Array<{
    source?: string;
    ok?: boolean;
    hits?: number;
    dropped?: number;
    excludedSeen?: number;
    error?: string;
    skipped?: boolean;
    code?: string;
    note?: string;
  }>,
  stats: { kept: number; want: number; complete?: boolean },
): { code: RegisterReasonCode; text: string } | null {
  if (stats.kept >= stats.want) return null;
  if (stats.complete === false) return null;
  if (!plan.official.length && !plan.homemade.length) {
    return { code: "OUT_OF_COVERAGE", text: `No register adapter for country ${plan.country}` };
  }
  const officialRows = report.filter((r) => plan.official.includes(String(r.source ?? "")));
  const officialDown =
    officialRows.length > 0 &&
    officialRows.every((r) => r.skipped || (r.ok === false && isTransportFailure(r.error, r.skipped)));
  if (officialDown && stats.kept === 0) {
    const err = officialRows.find((r) => r.error)?.error;
    return { code: "SOURCE_UNAVAILABLE", text: err ? String(err) : "Official register unavailable" };
  }
  const dropped = report.reduce((n, r) => n + (Number(r.dropped) || 0) + (Number(r.excludedSeen) || 0), 0);
  const hits = report.reduce((n, r) => n + (Number(r.hits) || 0), 0);
  const excludedSeen = report.reduce((n, r) => n + (Number(r.excludedSeen) || 0), 0);
  if (hits === 0 && dropped > 0) {
    if (excludedSeen > 0 && excludedSeen >= dropped) {
      return {
        code: "FILTER_EXCLUDED_ALL",
        text: "Matching companies were skipped because they were shown before.",
      };
    }
    return {
      code: "FILTER_EXCLUDED_ALL",
      text: plan.must.officialIndustry
        ? "Directory rows lacked an official industry after hydrate. Must-clauses were not relaxed."
        : "Every candidate was excluded by the criteria gate.",
    };
  }
  if (hits === 0 && !plan.should.directorySeeds.length && !plan.should.nameSeeds.length && !plan.must.industryCodes.length) {
    return { code: "NO_MATCH", text: "No distinctive seeds. Generic queries like yritys are never sent." };
  }
  if (stats.kept > 0 && stats.kept < stats.want) {
    return { code: "PARTIAL", text: `Kept ${stats.kept} of ${stats.want}. Register slice continues or is exhausted.` };
  }
  if (stats.kept === 0) {
    return { code: "NO_MATCH", text: "Official register and homemade directories returned no row that passed the gate." };
  }
  return null;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Hive Sensor contract for the register slice. Adapters stay in their files. */
export function registerSensorCapabilities(id: string): {
  id: string;
  countries: string[];
  queries: string[];
  official: boolean;
  parserVersion: string;
} | null {
  const table: Record<string, { countries: string[]; queries: string[]; official: boolean; parserVersion: string }> = {
    ytj: { countries: ["FI"], queries: ["businessId", "mainBusinessLine", "name", "location"], official: true, parserVersion: REGISTER_PARSER_VERSION.ytj },
    brreg: { countries: ["NO"], queries: ["orgnr", "nace", "name"], official: true, parserVersion: REGISTER_PARSER_VERSION.brreg },
    cvr: { countries: ["DK"], queries: ["vat", "name"], official: true, parserVersion: REGISTER_PARSER_VERSION.cvr },
    finder: { countries: ["FI"], queries: ["name", "keyword"], official: false, parserVersion: REGISTER_PARSER_VERSION.finder },
    kauppalehti: { countries: ["FI"], queries: ["name", "keyword"], official: false, parserVersion: REGISTER_PARSER_VERSION.kauppalehti },
    northdata: { countries: ["FI"], queries: ["name", "keyword"], official: false, parserVersion: REGISTER_PARSER_VERSION.northdata },
    proff: { countries: ["FI"], queries: ["name", "industry_label"], official: false, parserVersion: REGISTER_PARSER_VERSION.proff },
    asiakastieto: { countries: ["FI"], queries: ["name"], official: false, parserVersion: REGISTER_PARSER_VERSION.asiakastieto },
    wikidata: { countries: ["FI", "SE", "NO", "DK", "GB"], queries: ["name"], official: false, parserVersion: REGISTER_PARSER_VERSION.wikidata },
    nominatim: { countries: ["FI"], queries: ["name", "municipality"], official: false, parserVersion: REGISTER_PARSER_VERSION.nominatim },
    gleif: { countries: ["FI", "SE", "NO", "DK", "GB", "EU"], queries: ["legalName"], official: true, parserVersion: REGISTER_PARSER_VERSION.gleif },
  };
  const row = table[id];
  if (!row) return null;
  return { id, ...row };
}
