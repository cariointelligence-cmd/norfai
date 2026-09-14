import type { SourceState, SourceType } from "../types.ts";

export type SourceDef = {
  id: string;
  name: string;
  type: SourceType;
  countries: string[];
  fields: string[];
  credentialEnv?: string;
  credentialLabel?: string;
  licence: string;
  homepage: string;
  implemented: boolean;
  open: boolean;
};

export const SOURCE_CATALOG: SourceDef[] = [
  {
    id: "ytj",
    name: "PRH YTJ open data",
    type: "official_register",
    countries: ["FI"],
    fields: ["name", "businessId", "vatId", "address", "industry", "legalForm", "website", "status", "registrationDate"],
    licence: "PRH open data, CC BY 4.0 / source attribution required",
    homepage: "https://avoindata.prh.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "wikidata",
    name: "Wikidata",
    type: "wikidata",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["name", "website", "lei", "businessId", "ceo", "inception"],
    licence: "CC0. Supporting entity resolution only, never sole source for critical contact data",
    homepage: "https://www.wikidata.org/",
    implemented: true,
    open: true,
  },
  {
    id: "gleif",
    name: "GLEIF LEI",
    type: "official_register",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["lei", "legalName", "legalAddress", "status"],
    licence: "GLEIF Golden Copy, attribution",
    homepage: "https://www.gleif.org/",
    implemented: true,
    open: true,
  },
  {
    id: "vies",
    name: "EU VIES VAT",
    type: "eu_dataset",
    countries: ["EU", "FI"],
    fields: ["vatId", "vatValid", "registeredName", "registeredAddress"],
    licence: "European Commission VIES, validation only",
    homepage: "https://ec.europa.eu/taxation_customs/vies/",
    implemented: true,
    open: true,
  },
  {
    id: "website",
    name: "Company-controlled websites",
    type: "company_website",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["people", "email", "phone", "description", "technologies", "signals", "hiring"],
    licence: "Public pages; robots.txt honoured; excerpts stored as evidence",
    homepage: "",
    implemented: true,
    open: true,
  },
  {
    id: "wikipedia",
    name: "Wikipedia (fi/en)",
    type: "structured_web",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["website", "ceo", "chair"],
    licence: "CC BY-SA. Infobox fields only, corroborated when a company website exists",
    homepage: "https://fi.wikipedia.org/",
    implemented: true,
    open: true,
  },
  {
    id: "domain_guess",
    name: "DNS / guessed .fi domains",
    type: "dns_rdap",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["website", "email", "phone"],
    licence: "Public DNS and company-controlled HTTP; accepted only when the page mentions the company",
    homepage: "",
    implemented: true,
    open: true,
  },
  {
    id: "ted",
    name: "TED eTendering",
    type: "procurement",
    countries: ["EU", "FI"],
    fields: ["procurement"],
    licence: "EU Publications Office",
    homepage: "https://ted.europa.eu/",
    implemented: true,
    open: true,
  },
  {
    id: "hilma",
    name: "Hilma Hankintailmoitukset",
    type: "procurement",
    countries: ["FI"],
    fields: ["procurement"],
    licence: "Hansel / Finnish public procurement notices",
    homepage: "https://www.hankintailmoitukset.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "brreg",
    name: "Brønnøysund Register Centre",
    type: "official_register",
    countries: ["NO"],
    fields: ["name", "orgNumber", "address", "industry", "website"],
    licence: "NLOD / Norwegian open data",
    homepage: "https://data.brreg.no/",
    implemented: true,
    open: true,
  },
  {
    id: "cvr",
    name: "Danish CVR (cvrapi.dk)",
    type: "official_register",
    countries: ["DK"],
    fields: ["name", "vat", "address", "industry"],
    licence: "CVR / Erhvervsstyrelsen via cvrapi.dk. User-Agent identification required",
    homepage: "https://cvrapi.dk/",
    implemented: true,
    open: true,
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo Instant Answer + HTML search",
    type: "search_api",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["website", "people", "email", "phone", "contact_pages"],
    licence: "Public search results; official-site and infobox fields only, then verified against the company name",
    homepage: "https://duckduckgo.com/",
    implemented: true,
    open: true,
  },
  {
    id: "nominatim",
    name: "OpenStreetMap Nominatim",
    type: "open_government",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["lat", "lng", "phone", "website", "email"],
    licence: "ODbL; usage policy 1 req/s",
    homepage: "https://nominatim.openstreetmap.org/",
    implemented: true,
    open: true,
  },
  {
    id: "finder",
    name: "Fonecta Finder",
    type: "structured_web",
    countries: ["FI"],
    fields: ["website", "email", "phone", "people", "businessId"],
    licence: "Public Finder/Fonecta HTML; no commercial API is sold for this workspace, so listings are read from the public company profile",
    homepage: "https://www.finder.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "kauppalehti",
    name: "Kauppalehti company cards",
    type: "structured_web",
    countries: ["FI"],
    fields: ["people", "phone", "address", "website", "businessId"],
    licence: "Public Kauppalehti HTML and JSON-LD; no API key, company cards only",
    homepage: "https://www.kauppalehti.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "northdata",
    name: "North Data public cards",
    type: "structured_web",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["people", "address", "lei", "businessId", "founded"],
    licence: "Public North Data HTML and JSON-LD; officers and register facts only, no API key",
    homepage: "https://www.northdata.com/",
    implemented: true,
    open: true,
  },
  {
    id: "proff",
    name: "Proff.fi public directory",
    type: "structured_web",
    countries: ["FI"],
    fields: ["name", "businessId", "address"],
    licence: "Public Proff.fi / Enento HTML. robots.txt honoured (no /segmentointi, no paginated query strings). Y-tunnus extracted then hydrated via YTJ. Not a commercial rating.",
    homepage: "https://www.proff.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "linkedin",
    name: "LinkedIn public pages",
    type: "structured_web",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["people", "website", "profileUrl"],
    licence: "Public search + public pages only; login walls stay Not found",
    homepage: "https://www.linkedin.com/",
    implemented: true,
    open: true,
  },
  {
    id: "grok_search",
    name: "Grok web search (capped last resort)",
    type: "search_api",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["website", "email", "phone", "people"],
    licence: "xAI Responses API web_search; user-initiated, capped, DNS-verified websites only",
    homepage: "https://docs.x.ai/",
    implemented: true,
    open: true,
  },
  {
    id: "rdap",
    name: "RDAP / DNS",
    type: "dns_rdap",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["domain", "mx"],
    licence: "Public RDAP",
    homepage: "https://rdap.org/",
    implemented: true,
    open: true,
  },
  {
    id: "crtsh",
    name: "crt.sh certificate transparency",
    type: "dns_rdap",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["domain"],
    licence: "crt.sh public CT search",
    homepage: "https://crt.sh/",
    implemented: true,
    open: true,
  },
  {
    id: "user_upload",
    name: "User-uploaded seed lists",
    type: "user_upload",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["businessId", "name"],
    licence: "Workspace-provided identifiers; enrichment still uses connected public sources",
    homepage: "",
    implemented: true,
    open: true,
  },
  {
    id: "opencorporates",
    name: "OpenCorporates",
    type: "structured_web",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["name", "companyNumber", "jurisdiction"],
    credentialEnv: "OPENCORPORATES_API_KEY",
    credentialLabel: "OpenCorporates API token (optional upgrade)",
    licence: "Public OpenCorporates HTML and unauthenticated JSON. Licensed API is an optional upgrade.",
    homepage: "https://opencorporates.com/",
    implemented: true,
    open: true,
  },
  {
    id: "hunter",
    name: "Hunter.io",
    type: "company_website",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["email"],
    credentialEnv: "HUNTER_API_KEY",
    credentialLabel: "Hunter API key (optional upgrade)",
    licence: "Published emails on company-controlled pages. Hunter commercial API is an optional upgrade.",
    homepage: "https://hunter.io/",
    implemented: true,
    open: true,
  },
  {
    id: "companies_house",
    name: "UK Companies House",
    type: "official_register",
    countries: ["GB"],
    fields: ["name", "companyNumber", "officers"],
    credentialEnv: "COMPANIES_HOUSE_API_KEY",
    credentialLabel: "Companies House API key (optional upgrade)",
    licence: "UK Companies House public search. Open Government Licence. API key is an optional upgrade.",
    homepage: "https://find-and-update.company-information.service.gov.uk/",
    implemented: true,
    open: true,
  },
  {
    id: "search_api",
    name: "Configured search API",
    type: "search_api",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["web"],
    credentialEnv: "SEARCH_API_KEY",
    credentialLabel: "Bing API key (optional upgrade)",
    licence: "First-party web discovery (DuckDuckGo HTML). Licensed Bing key is an optional upgrade.",
    homepage: "https://html.duckduckgo.com/html/",
    implemented: true,
    open: true,
  },
  {
    id: "asiakastieto",
    name: "Asiakastieto / Suomen Asiakastieto",
    type: "structured_web",
    countries: ["FI"],
    fields: ["finance", "rating"],
    credentialEnv: "ASIAKASTIETO_API_KEY",
    credentialLabel: "Asiakastieto API key (optional contract)",
    licence: "Published accounts on Kauppalehti and North Data cards. No Asiakastieto commercial rating without a contract.",
    homepage: "https://www.kauppalehti.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "business_finland",
    name: "Business Finland funding",
    type: "open_government",
    countries: ["FI"],
    fields: ["funding"],
    licence: "Business Finland public pages where funding is published",
    homepage: "https://www.businessfinland.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "statfin",
    name: "Statistics Finland PxWeb",
    type: "open_government",
    countries: ["FI"],
    fields: ["industry_aggregates"],
    licence: "Statistics Finland PxWeb, CC BY 4.0. Industry aggregates, not invented company revenue.",
    homepage: "https://statfin.stat.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "ejustice",
    name: "European e-Justice business registers",
    type: "eu_dataset",
    countries: ["EU"],
    fields: ["register_links"],
    licence: "EU e-Justice business registers portal. Link-out to the national register, not a bulk API.",
    homepage: "https://e-justice.europa.eu/",
    implemented: true,
    open: true,
  },
  {
    id: "commoncrawl",
    name: "Common Crawl",
    type: "structured_web",
    countries: ["EU"],
    fields: ["web_archive"],
    licence: "Common Crawl CDX index. Archive lookup, not live interactive ranking.",
    homepage: "https://commoncrawl.org/",
    implemented: true,
    open: true,
  },
  {
    id: "bolagsverket",
    name: "Swedish Bolagsverket",
    type: "official_register",
    countries: ["SE"],
    fields: ["name", "orgNumber"],
    licence: "Allabolag public company cards. Bolagsverket has no bulk open API without a contract.",
    homepage: "https://www.allabolag.se/",
    implemented: true,
    open: true,
  },
  {
    id: "prh_xbrl",
    name: "PRH iXBRL financials",
    type: "official_register",
    countries: ["FI"],
    fields: ["revenue", "profit"],
    licence: "PRH XBRL open data, CC BY 4.0. Empty responses stay UNAVAILABLE.",
    homepage: "https://avoindata.prh.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "esef_xbrl",
    name: "ESEF filings (filings.xbrl.org)",
    type: "official_register",
    countries: ["FI", "EU"],
    fields: ["revenue", "profit", "equity", "assets"],
    licence: "Public ESEF reports. Identity via LEI. Listed companies.",
    homepage: "https://filings.xbrl.org/",
    implemented: true,
    open: true,
  },
  {
    id: "duunitori",
    name: "Public job boards",
    type: "structured_web",
    countries: ["FI"],
    fields: ["hiring"],
    licence: "Public Duunitori and Työmarkkinatori search snippets. Not a job-board API contract.",
    homepage: "https://duunitori.fi/",
    implemented: true,
    open: true,
  },
  {
    id: "apify",
    name: "Apify collection platform",
    type: "licensed_api",
    countries: ["FI", "SE", "NO", "DK", "EU"],
    fields: ["enrichment"],
    credentialEnv: "APIFY_API",
    credentialLabel: "Apify API token (approved tools only)",
    licence: "Apify platform. Actors run only when explicitly approved. Never a register of record. Official YTJ identity always wins conflicts.",
    homepage: "https://apify.com/",
    implemented: true,
    open: false,
  },
];

const KEY_REQUIRED = new Set(["hunter", "search_api", "asiakastieto", "grok_search", "apify"]);

export function initialState(def: SourceDef, env: NodeJS.ProcessEnv = process.env): SourceState {
  if (!def.implemented) return def.open ? "not_implemented" : "optional_offline";
  if (KEY_REQUIRED.has(def.id) && def.credentialEnv && !env[def.credentialEnv]?.trim()) return "optional_offline";
  if (!def.open && def.credentialEnv && !env[def.credentialEnv]?.trim()) return "optional_offline";
  if (def.id === "grok_search" && !env.XAI_API_KEY?.trim()) return "optional_offline";
  return "connected";
}

export type NetworkEngineId =
  | "registry"
  | "web"
  | "contact"
  | "domain"
  | "signals"
  | "resolution"
  | "optional";

export const NETWORK_ENGINES: Array<{
  id: NetworkEngineId;
  label: string;
  blurb: string;
  sourceIds: string[];
  core: boolean;
}> = [
  {
    id: "registry",
    label: "Registry Sources",
    blurb: "Official company registers: YTJ, Brønnøysund, CVR, GLEIF, VIES, Companies House, Allabolag, OpenCorporates.",
    sourceIds: ["ytj", "brreg", "cvr", "gleif", "vies", "companies_house", "bolagsverket", "opencorporates"],
    core: true,
  },
  {
    id: "web",
    label: "Web Discovery",
    blurb: "First-party sites, Finder, Kauppalehti, North Data, Wikipedia, LinkedIn public pages, DuckDuckGo, Common Crawl.",
    sourceIds: ["website", "duckduckgo", "finder", "kauppalehti", "northdata", "proff", "wikipedia", "linkedin", "search_api", "commoncrawl", "grok_search"],
    core: true,
  },
  {
    id: "contact",
    label: "Contact Discovery",
    blurb: "Published emails, phones and decision makers from company pages and public directories.",
    sourceIds: ["website", "finder", "kauppalehti", "northdata", "domain_guess", "hunter"],
    core: true,
  },
  {
    id: "domain",
    label: "Domain Intelligence",
    blurb: "DNS guesses, RDAP and certificate transparency. Accepted only when the page names the company.",
    sourceIds: ["domain_guess", "rdap", "crtsh"],
    core: true,
  },
  {
    id: "signals",
    label: "Public Signals",
    blurb: "TED, Hilma, Business Finland, StatFin, e-Justice and published accounts. Not invented finance.",
    sourceIds: ["ted", "hilma", "nominatim", "business_finland", "statfin", "ejustice", "asiakastieto", "prh_xbrl", "esef_xbrl", "duunitori"],
    core: true,
  },
  {
    id: "resolution",
    label: "Entity Resolution",
    blurb: "Same legal entity vs branch office. Wikidata is supporting evidence only.",
    sourceIds: ["wikidata"],
    core: true,
  },
];

export function productLabel(state: SourceState): { label: string; tone: "good" | "mute" | "warn" | "bad" } {
  switch (state) {
    case "connected":
      return { label: "Online", tone: "good" };
    case "optional_offline":
      return { label: "Standby", tone: "mute" };
    case "not_implemented":
      return { label: "Not in network", tone: "mute" };
    case "rate_limited":
      return { label: "Throttled", tone: "warn" };
    case "temporarily_unavailable":
      return { label: "Degraded", tone: "warn" };
    case "access_prohibited":
      return { label: "Blocked", tone: "bad" };
    case "missing_credentials":
      return { label: "Standby", tone: "mute" };
    default:
      return { label: state, tone: "mute" };
  }
}

export function engineSnapshot(env: NodeJS.ProcessEnv = process.env) {
  return NETWORK_ENGINES.map((engine) => {
    const members = engine.sourceIds
      .map((id) => SOURCE_CATALOG.find((s) => s.id === id))
      .filter((s): s is SourceDef => Boolean(s));
    const states = members.map((s) => initialState(s, env));
    const online = states.filter((s) => s === "connected").length;
    const status: SourceState =
      engine.core
        ? online > 0
          ? "connected"
          : "temporarily_unavailable"
        : online > 0
          ? "connected"
          : "optional_offline";
    return {
      id: engine.id,
      label: engine.label,
      blurb: engine.blurb,
      core: engine.core,
      online,
      total: members.length,
      status,
      sources: members.map((s, i) => ({
        id: publicSourceKey(s),
        name: productName(s),
        countries: s.countries,
        state: states[i]!,
      })),
    };
  });
}

export type AccessType = "OPEN_API" | "PUBLIC_WEB" | "OPEN_DATA" | "REGISTRY" | "OPTIONAL_COMMERCIAL" | "USER";

export function displayState(state: SourceState): SourceState {
  return state === "missing_credentials" ? "optional_offline" : state;
}

export function accessTypeOf(def: SourceDef): AccessType {
  if (!def.open) return "OPTIONAL_COMMERCIAL";
  if (def.type === "official_register") return "REGISTRY";
  if (def.type === "open_government" || def.type === "eu_dataset" || def.type === "procurement") return "OPEN_DATA";
  if (def.type === "company_website" || def.type === "structured_web" || def.type === "search_api") return "PUBLIC_WEB";
  if (def.type === "dns_rdap" || def.type === "wikidata") return "OPEN_API";
  if (def.type === "user_upload") return "USER";
  return "OPEN_DATA";
}

export function productName(def: SourceDef): string {
  switch (def.id) {
    case "ytj":
      return "Finnish Trade Register (YTJ)";
    case "website":
      return "Company websites";
    case "duckduckgo":
      return "Web discovery";
    case "domain_guess":
      return "Domain intelligence";
    case "grok_search":
      return "Norf last-resort search";
    case "finder":
      return "Finnish business directory";
    case "kauppalehti":
      return "Kauppalehti company cards";
    case "northdata":
      return "North Data officers";
    case "linkedin":
      return "LinkedIn public pages";
    case "opencorporates":
      return "OpenCorporates";
    case "hunter":
      return "Published page mailboxes";
    case "companies_house":
      return "UK Companies House";
    case "search_api":
      return "Web search";
    case "asiakastieto":
      return "Published accounts";
    case "bolagsverket":
      return "Swedish company cards";
    case "apify":
      return "Approved collection layer";
    default:
      return def.name;
  }
}

export function publicSourceView(def: SourceDef, liveState: SourceState, health: Record<string, unknown> | null = null) {
  const state = displayState(liveState);
  const shown = productLabel(state);
  const lastDetail = typeof health?.last_test_detail === "string" ? String(health.last_test_detail) : null;
  const scrubbed =
    lastDetail && /API_KEY|credentials?|not set|SECRET|TOKEN|APIFY/i.test(lastDetail) ? null : lastDetail;
  return {
    id: publicSourceKey(def),
    name: productName(def),
    type: accessTypeOf(def),
    countries: def.countries,
    liveState: state,
    product: shown,
    health: health
      ? {
          state: displayState(String(health.state ?? state) as SourceState),
          last_latency_ms: health.last_latency_ms ?? null,
          last_success_at: health.last_success_at ?? null,
          last_test_ok: health.last_test_ok ?? null,
          last_test_detail: scrubbed,
          enabled: health.enabled ?? def.implemented,
        }
      : null,
  };
}

export function publicSourceKey(def: SourceDef): string {
  return productName(def)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function coreCatalog() {
  return SOURCE_CATALOG.filter((s) => s.open && s.implemented);
}

export function reliability(id: string): number {
  switch (id) {
    case "ytj":
    case "brreg":
    case "cvr":
    case "vies":
    case "gleif":
    case "companies_house":
      return 95;
    case "bolagsverket":
      return 80;
    case "website":
      return 80;
    case "finder":
      return 82;
    case "kauppalehti":
      return 84;
    case "northdata":
      return 83;
    case "wikipedia":
      return 70;
    case "duckduckgo":
    case "search_api":
      return 58;
    case "linkedin":
      return 55;
    case "grok_search":
      return 52;
    case "domain_guess":
      return 55;
    case "ted":
    case "hilma":
      return 85;
    case "rdap":
    case "crtsh":
      return 75;
    case "wikidata":
      return 60;
    case "nominatim":
      return 70;
    case "opencorporates":
      return 80;
    case "hunter":
      return 74;
    case "asiakastieto":
      return 72;
    case "prh_xbrl":
      return 90;
    case "esef_xbrl":
      return 88;
    case "duunitori":
      return 64;
    case "business_finland":
      return 62;
    case "statfin":
      return 88;
    case "ejustice":
      return 70;
    case "commoncrawl":
      return 55;
    case "apify":
      return 48;
    case "user_upload":
      return 50;
    default:
      return 40;
  }
}
