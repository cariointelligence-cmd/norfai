import type { CriteriaGroup, Criterion, SearchCriteria } from "./types.ts";
import { nid } from "../utils.ts";
import { CUSTOMER_TYPE_CODES, industryLabel, industryMatches, industryNameBlocked, inferIndustryCodes, isAllIndustries, isHousingCompany, isInactiveCompany, municipalitiesMatch, wantsHousingIndustry, type CustomerType } from "./finland.ts";
import { ENGINE_SEARCH_CEILING } from "./platform.ts";
import { isSupportedCountry } from "./sources/queries.ts";


export function emptyCriteria(): SearchCriteria {
  return {
    country: "FI",
    maxResults: 100,
    depth: "normal",
    mode: "quick",
    target: {},
    roles: ["ceo", "sales_director"],
    prioritizeNew: true,
    excludeSeen: true,
    excludeExported: false,
    excludeCustomers: true,
    groups: {
      id: "root",
      combinator: "and",
      rules: [
        { id: nid(), field: "country", op: "eq", value: "FI" },
        { id: nid(), field: "active_only", op: "eq", value: true },
      ],
    },
  };
}

export const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  municipality: "City or municipality",
  postal_code: "Postal code",
  industry: "Industry (register code)",
  keyword: "Keyword on the name or website",
  legal_form: "Legal form",
  employee_min: "Employees at least",
  employee_max: "Employees at most",
  revenue_min: "Published revenue at least (EUR)",
  revenue_max: "Published revenue at most (EUR)",
  founded_from: "Founded from year",
  founded_to: "Founded to year",
  active_only: "Only active companies",
  website_required: "Must have a website",
  website_weak: "Weak or outdated website",
  ecommerce: "Has online shop signals",
  hiring: "Hiring signals",
  expansion: "Expansion signals",
  procurement: "Public procurement",
  confidence_min: "Minimum match score",
  freshness_days: "Data not older than (days)",
  business_id: "Business ID (Y-tunnus)",
  contact_email: "Must have an email",
  radius: "Radius from city (km)",
};

export const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  gte: "at least",
  lte: "at most",
  exists: "is present",
  in: "is one of",
  within_km: "within km",
};

const FIELD_I18N: Record<string, { fi: string; en: string; sv: string }> = {
  country: { fi: "Maa", en: "Country", sv: "Land" },
  municipality: { fi: "Kunta tai kaupunki", en: "City or municipality", sv: "Kommun eller stad" },
  postal_code: { fi: "Postinumero", en: "Postal code", sv: "Postnummer" },
  industry: { fi: "Toimiala (rekisterikoodi)", en: "Industry (register code)", sv: "Bransch (registerkod)" },
  keyword: { fi: "Hakusana nimessä tai sivustolla", en: "Keyword on the name or website", sv: "Nyckelord i namn eller på sajt" },
  legal_form: { fi: "Yhtiömuoto", en: "Legal form", sv: "Bolagsform" },
  employee_min: { fi: "Henkilöstöä vähintään", en: "Employees at least", sv: "Anställda minst" },
  employee_max: { fi: "Henkilöstöä enintään", en: "Employees at most", sv: "Anställda högst" },
  revenue_min: { fi: "Julkaistu liikevaihto vähintään (EUR)", en: "Published revenue at least (EUR)", sv: "Publicerad omsättning minst (EUR)" },
  revenue_max: { fi: "Julkaistu liikevaihto enintään (EUR)", en: "Published revenue at most (EUR)", sv: "Publicerad omsättning högst (EUR)" },
  founded_from: { fi: "Perustettu vuodesta", en: "Founded from year", sv: "Grundat från år" },
  founded_to: { fi: "Perustettu vuoteen", en: "Founded to year", sv: "Grundat till år" },
  active_only: { fi: "Vain aktiiviset yritykset", en: "Only active companies", sv: "Endast aktiva bolag" },
  website_required: { fi: "Verkkosivu pakollinen", en: "Must have a website", sv: "Webbplats krävs" },
  website_weak: { fi: "Heikko tai vanhentunut sivusto", en: "Weak or outdated website", sv: "Svag eller föråldrad sajt" },
  ecommerce: { fi: "Verkkokaupan signaaleja", en: "Has online shop signals", sv: "Har e-handelssignaler" },
  hiring: { fi: "Rekrytointisignaaleja", en: "Hiring signals", sv: "Rekryteringssignaler" },
  expansion: { fi: "Laajentumissignaaleja", en: "Expansion signals", sv: "Expansionssignaler" },
  procurement: { fi: "Julkiset hankinnat", en: "Public procurement", sv: "Offentlig upphandling" },
  confidence_min: { fi: "Vähimmäissopivuus", en: "Minimum match score", sv: "Minsta matchningspoäng" },
  freshness_days: { fi: "Tiedot enintään (päivää)", en: "Data not older than (days)", sv: "Data inte äldre än (dagar)" },
  business_id: { fi: "Y-tunnus", en: "Business ID (Y-tunnus)", sv: "FO-nummer" },
  contact_email: { fi: "Sähköposti pakollinen", en: "Must have an email", sv: "E-post krävs" },
  radius: { fi: "Säde kunnasta (km)", en: "Radius from city (km)", sv: "Radie från stad (km)" },
};

const OP_I18N: Record<string, { fi: string; en: string; sv: string }> = {
  eq: { fi: "on", en: "is", sv: "är" },
  neq: { fi: "ei ole", en: "is not", sv: "är inte" },
  contains: { fi: "sisältää", en: "contains", sv: "innehåller" },
  gte: { fi: "vähintään", en: "at least", sv: "minst" },
  lte: { fi: "enintään", en: "at most", sv: "högst" },
  exists: { fi: "on olemassa", en: "is present", sv: "finns" },
  in: { fi: "on jokin näistä", en: "is one of", sv: "är en av" },
  within_km: { fi: "säde km", en: "within km", sv: "inom km" },
};

export const BOOLEAN_FIELDS = new Set([
  "active_only",
  "website_required",
  "website_weak",
  "ecommerce",
  "hiring",
  "expansion",
  "procurement",
]);

export const FIELD_GROUPS: Array<{ id: string; fields: string[] }> = [
  { id: "identity", fields: ["country", "municipality", "postal_code", "radius", "industry", "keyword", "legal_form", "business_id"] },
  { id: "size", fields: ["employee_min", "employee_max", "revenue_min", "revenue_max", "founded_from", "founded_to"] },
  { id: "web", fields: ["website_required", "website_weak", "ecommerce", "contact_email"] },
  { id: "signals", fields: ["active_only", "hiring", "expansion", "procurement", "confidence_min", "freshness_days"] },
];

export function fieldLabel(field: string, locale: string = "en"): string {
  const row = FIELD_I18N[field];
  if (!row) return FIELD_LABELS[field] ?? field.replaceAll("_", " ");
  if (locale === "fi") return row.fi;
  if (locale === "sv") return row.sv;
  return row.en;
}

export function opLabel(op: string, locale: string = "en"): string {
  const row = OP_I18N[op];
  if (!row) return OP_LABELS[op] ?? op;
  if (locale === "fi") return row.fi;
  if (locale === "sv") return row.sv;
  return row.en;
}

export function defaultOpForField(field: string): Criterion["op"] {
  if (field === "keyword") return "contains";
  if (field.endsWith("_min") || field === "founded_from" || field === "confidence_min" || field === "freshness_days") return "gte";
  if (field.endsWith("_max") || field === "founded_to") return "lte";
  if (field === "contact_email") return "exists";
  if (field === "radius") return "within_km";
  return "eq";
}

export function flattenRules(group: CriteriaGroup): Criterion[] {
  const out: Criterion[] = [];
  for (const r of group.rules) {
    if ("rules" in r) out.push(...flattenRules(r));
    else out.push(r);
  }
  return out;
}

export function valuesOf(c: SearchCriteria, field: Criterion["field"]): Array<string | number | boolean> {
  return flattenRules(c.groups)
    .filter((r) => r.field === field && r.value !== null && r.value !== "")
    .flatMap((r) => (Array.isArray(r.value) ? r.value : [r.value as string | number | boolean]));
}

export function firstValue<T = string>(c: SearchCriteria, field: Criterion["field"]): T | undefined {
  const v = valuesOf(c, field)[0];
  return v as T | undefined;
}

export function validateCriteria(c: SearchCriteria): { ok: true } | { ok: false; error: string } {
  if (c.country && !isSupportedCountry(c.country)) {
    return { ok: false, error: "Supported countries: FI, NO, DK, SE, GB, DE, US, EU" };
  }
  const max = c.maxResults ?? 100;
  if (max < 1 || max > ENGINE_SEARCH_CEILING) return { ok: false, error: `maxResults must be 1–${ENGINE_SEARCH_CEILING}` };
  const hasName = valuesOf(c, "keyword").length > 0;
  const industries = valuesOf(c, "industry").map(String);
  const hasIndustry = industries.length > 0 && !isAllIndustries(industries);
  const hasAllIndustries = isAllIndustries(industries);
  const hasBid = valuesOf(c, "business_id").length > 0;
  const hasPlace = valuesOf(c, "municipality").length > 0;
  if (!hasName && !hasIndustry && !hasBid && !hasPlace && !hasAllIndustries) {
    return {
      ok: false,
      error: "Add a place, an industry, or Kaikki toimialat. An empty national scan is blocked.",
    };
  }
  return { ok: true };
}

export function setMunicipality(c: SearchCriteria, name: string): SearchCriteria {
  const rules = c.groups.rules.filter((r) => "rules" in r || r.field !== "municipality");
  const v = name.trim();
  if (v) rules.push({ id: nid(), field: "municipality", op: "eq", value: v });
  return { ...c, groups: { ...c.groups, rules } };
}

export function withoutMunicipality(c: SearchCriteria): SearchCriteria {
  return {
    ...c,
    groups: { ...c.groups, rules: c.groups.rules.filter((r) => "rules" in r || r.field !== "municipality") },
  };
}

export function setIndustryCodes(c: SearchCriteria, codes: string[]): SearchCriteria {
  const rules = c.groups.rules.filter((r) => "rules" in r || r.field !== "industry");
  const unique = [...new Set(codes.map((x) => String(x).trim()).filter(Boolean))];
  const all = unique.some((x) => x.toUpperCase() === "ALL");
  const stored = all ? ["ALL"] : unique;
  for (const code of stored) {
    rules.push({ id: nid(), field: "industry", op: "eq", value: code });
  }
  const target = {
    ...c.target,
    industry: { ...c.target?.industry, codes: stored.length ? stored : c.target?.industry?.codes },
  };
  return { ...c, groups: { ...c.groups, rules }, target };
}

export function tightenCriteria(c: SearchCriteria): SearchCriteria {
  let next = { ...c, groups: { ...c.groups, rules: [...c.groups.rules] } };
  const existing = valuesOf(next, "industry").map(String);
  if (!existing.length) {
    const blob = [c.prompt ?? "", ...valuesOf(c, "keyword").map(String)].join(" ");
    const inferred = inferIndustryCodes(blob);
    if (inferred.length) next = setIndustryCodes(next, inferred);
  }
  if (!valuesOf(next, "industry").length && c.target?.customerType && c.target.customerType !== "b2b") {
    const mapped = CUSTOMER_TYPE_CODES[c.target.customerType as CustomerType];
    if (mapped?.length) next = setIndustryCodes(next, mapped);
  }
  return next;
}

export function passesLocalFilters(c: {
  name?: string | null;
  industryCode?: string | null;
  industryLabel?: string | null;
  municipality?: string | null;
  website?: string | null;
  registrationDate?: string | null;
  endDate?: string | null;
  businessStatus?: string | null;
  legalForm?: string | null;
  legalFormCode?: string | null;
  tradeRegisterStatus?: string | null;
  businessId?: string | null;
}, criteria: SearchCriteria): { ok: boolean; reasons: string[]; missed: string[] } {
  const reasons: string[] = [];
  const missed: string[] = [];
  const industries = valuesOf(criteria, "industry").map(String);
  if (isInactiveCompany(c)) {
    missed.push("inactive");
    return { ok: false, reasons, missed };
  }
  if (industryNameBlocked(c.name, industries)) {
    missed.push("industry name");
    return { ok: false, reasons, missed };
  }
  if (isHousingCompany(c) && !wantsHousingIndustry(industries)) {
    missed.push("housing company");
    return { ok: false, reasons, missed };
  }
  if (industries.length && !isAllIndustries(industries)) {
    const codeHit = industryMatches(c.industryCode, industries);
    const labelBlob = (c.industryLabel ?? "").toLowerCase();
    const labelHit = industries.some((code) => {
      const lab = industryLabel(code)?.toLowerCase();
      return Boolean(lab && lab.length >= 12 && labelBlob.includes(lab));
    });
    if (codeHit || labelHit) {
      reasons.push(`industry ${c.industryCode ?? c.industryLabel}`);
    } else {
      missed.push(`industry ${c.industryCode ?? "unknown"}`);
      return { ok: false, reasons, missed };
    }
  }
  const keywords = valuesOf(criteria, "keyword").map(String);
  if (keywords.length && c.name) {
    const blob = `${c.name} ${c.industryLabel ?? ""}`.toLowerCase();
    if (keywords.some((k) => blob.includes(String(k).toLowerCase()))) reasons.push("keyword");
    else if (!industries.length) {
      missed.push("keyword");
      return { ok: false, reasons, missed };
    }
  }
  const muns = valuesOf(criteria, "municipality").map(String);
  if (muns.length && c.municipality) {
    const hit = muns.some((m) => municipalitiesMatch(c.municipality, String(m)));
    if (hit) reasons.push(`municipality ${c.municipality}`);
    else {
      missed.push(`municipality ${c.municipality}`);
      return { ok: false, reasons, missed };
    }
  } else if (muns.length && !c.municipality) {
    missed.push("municipality unknown");
    return { ok: false, reasons, missed };
  }
  if (valuesOf(criteria, "website_required").some(Boolean) && c.website) {
    reasons.push("website present");
  }
  if (valuesOf(criteria, "active_only").some(Boolean)) {
    reasons.push("active");
  }
  const foundedFrom = valuesOf(criteria, "founded_from")[0];
  if (foundedFrom && c.registrationDate && String(c.registrationDate) < String(foundedFrom)) {
    missed.push("too old vs founded_from");
    return { ok: false, reasons, missed };
  }
  const foundedTo = valuesOf(criteria, "founded_to")[0];
  if (foundedTo && c.registrationDate && String(c.registrationDate) > String(foundedTo)) {
    missed.push("too new vs founded_to");
    return { ok: false, reasons, missed };
  }
  return { ok: true, reasons, missed };
}


export function describeCriteria(c: SearchCriteria): string {
  const bits: string[] = [];
  const kw = valuesOf(c, "keyword").map(String);
  const ind = valuesOf(c, "industry").map(String);
  const mun = valuesOf(c, "municipality").map(String);
  const rad = firstValue<number>(c, "radius");
  if (c.country) bits.push(`country ${c.country}`);
  if (ind.length) bits.push(`industry ${ind.join(" | ")}`);
  if (kw.length) bits.push(`keywords ${kw.join(" | ")}`);
  if (mun.length) bits.push(`municipality ${mun.join(", ")}`);
  if (rad) bits.push(`radius ${rad} km`);
  if (c.mode && c.mode !== "quick") bits.push(`mode ${c.mode}`);
  if (c.preset) bits.push(`preset ${c.preset}`);
  if (c.target && JSON.stringify(c.target) !== "{}") bits.push("targeting spec");
  bits.push(`cap ${c.maxResults}`);
  return bits.join(" · ");
}

export function estimateScope(c: SearchCriteria): {
  label: string;
  limitations: string[];
  sources: string[];
} {
  const limitations: string[] = [];
  const sources = [
    "Norf Source Network (open registers + first-party websites + web discovery)",
    "Company websites (robots.txt honoured)",
    "DuckDuckGo",
    "GLEIF",
    "Wikidata (supporting only)",
  ];
  if (c.country === "FI" || !c.country) sources.unshift("Finnish Trade Register (YTJ)", "Fonecta Finder");
  if (valuesOf(c, "procurement").some(Boolean)) sources.push("TED", "Hilma");
  if (c.country === "NO") sources.push("Brønnøysund Register Centre");
  if (c.country === "DK") sources.push("Danish CVR");
  if (c.country === "SE") {
    sources.push("GLEIF + Wikidata + Swedish web discovery");
    limitations.push("Bolagsverket has no open bulk API here; Swedish hits come from GLEIF, Wikidata and public websites.");
  }
  if (c.country === "GB") {
    sources.push("GLEIF + Wikidata + UK web discovery");
    limitations.push("Companies House API is optional. UK search continues through GLEIF, Wikidata and public websites.");
  }
  if (c.country === "DE") {
    sources.push("GLEIF + Wikidata + German web discovery");
    limitations.push("No Handelsregister bulk API is configured; German hits come from GLEIF, Wikidata and public websites.");
  }
  if (c.country === "US") {
    sources.push("GLEIF + Wikidata + US web discovery");
    limitations.push("No US Secretary of State bulk feed is configured; US hits come from GLEIF, Wikidata and public websites.");
  }
  if (c.depth === "deep" || c.mode === "deep") {
    sources.push("Deep search: extra website routes, more web queries, procurement and people pages");
  }
  if (c.mode === "opportunity" || c.preset) {
    sources.push("Opportunity finder (website / SEO / digital / advertising signals after crawl)");
  }
  if (c.prompt || c.mode === "ai") {
    sources.push("AI target builder (deterministic interpretation of the prompt)");
  }
  limitations.push("Employee count and revenue are rarely published in YTJ; they stay Not found unless another source provides them.");
  limitations.push("Board and management names are not in the YTJ open API; people are taken from Finder, public company pages, LinkedIn and Wikidata.");
  limitations.push(`At most ${c.maxResults} companies are persisted per run to respect source rate limits.`);
  if (c.target && JSON.stringify(c.target) !== "{}") {
    limitations.push("Website, SEO and digital-maturity scores are measured from the public homepage after it is crawled. They stay Not found until that page is fetched.");
    limitations.push("Revenue and profit stay Not found unless a register, Wikidata or the company site published a figure. Unknown values are never invented.");
    limitations.push("Meta advertising is inferred from pixels or tags on the company site. Norf never claims monthly spend.");
    limitations.push("If a filter is set to allow unknown, companies without that field still appear and are labelled Not found on that dimension.");
  }
  if (!valuesOf(c, "industry").length && !valuesOf(c, "keyword").length) {
    limitations.push("Location-only searches return the register's first page after filters, not a complete census.");
  }
  return {
    label: describeCriteria(c),
    limitations,
    sources,
  };
}
