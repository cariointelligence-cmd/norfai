export const RUNTIME_STATES = ["ACTIVE", "DEGRADED", "UNAVAILABLE", "DISABLED", "EXPERIMENTAL", "RETIRED"] as const;
export type RuntimeState = (typeof RUNTIME_STATES)[number];

export type SourceRuntime = {
  id: string;
  adapter: string;
  callSites: string[];
  status: RuntimeState;
  categories: string[];
  note: string;
};

/**
 * Runtime wiring vs catalog. ACTIVE only when pipeline actually calls the adapter.
 * scoreNative is retired: product scores must be explainable TypeScript parts, not a C++ black box.
 * trafficScore is retired: no traffic source exists; do not present it as a sales signal.
 */
export const SOURCE_RUNTIME: SourceRuntime[] = [
  { id: "ytj", adapter: "sources/ytj.ts", callSites: ["runDiscover", "runEnrich", "refresh"], status: "ACTIVE", categories: ["identity", "industry", "status"], note: "Official FI register" },
  { id: "prh_xbrl", adapter: "sources/homemade.ts#prhXbrlLookup", callSites: ["runEnrich"], status: "ACTIVE", categories: ["revenue", "profit", "equity"], note: "Official iXBRL when a Finnish business ID exists. Empty period lists stay UNAVAILABLE." },
  { id: "esef_xbrl", adapter: "sources/filings-xbrl.ts#esefLookup", callSites: ["runEnrich"], status: "ACTIVE", categories: ["revenue", "profit", "equity"], note: "ESEF filings via LEI (listed companies). Not a YTJ replacement." },
  { id: "duunitori", adapter: "sources/homemade.ts#publicHiringSearch", callSites: ["runEnrich"], status: "ACTIVE", categories: ["hiring"], note: "Public job-board snippets via DDG. Live HTML search is often HTTP 202; failure is source_failed, not 'not hiring'." },
  { id: "wikidata", adapter: "sources/open.ts#wikidataLookup", callSites: ["runEnrich"], status: "ACTIVE", categories: ["lei", "people"], note: "Supporting evidence" },
  { id: "gleif", adapter: "sources/open.ts#gleifLookup", callSites: ["runEnrich"], status: "ACTIVE", categories: ["lei"], note: "LEI" },
  { id: "vies", adapter: "sources/open.ts#viesValidate", callSites: ["runEnrich"], status: "ACTIVE", categories: ["vat"], note: "VAT check" },
  { id: "website", adapter: "sources/webdiscover.ts", callSites: ["runEnrich", "runCrawl"], status: "ACTIVE", categories: ["contacts", "website", "hiring"], note: "First-party pages. schema.org JobPosting is hiring_confirmed; career-page keywords are hiring_indicated." },
  { id: "finder", adapter: "sources/finder.ts", callSites: ["runEnrich"], status: "ACTIVE", categories: ["contacts"], note: "Public directory cards" },
  { id: "kauppalehti", adapter: "sources/kauppalehti.ts", callSites: ["runEnrich"], status: "ACTIVE", categories: ["contacts", "html_finance"], note: "HTML supplement only; never overrides PRH XBRL" },
  { id: "northdata", adapter: "sources/northdata.ts", callSites: ["runEnrich"], status: "ACTIVE", categories: ["contacts"], note: "HTML supplement" },
  { id: "linkedin", adapter: "sources/linkedin.ts", callSites: ["runEnrich"], status: "ACTIVE", categories: ["people"], note: "Public pages" },
  { id: "ted", adapter: "sources/open.ts#tedSearch", callSites: ["runSignals"], status: "ACTIVE", categories: ["procurement"], note: "Name match with confidence gate" },
  { id: "hilma", adapter: "sources/open.ts#hilmaSearch", callSites: ["runSignals"], status: "ACTIVE", categories: ["procurement"], note: "Name match with confidence gate" },
  { id: "hunter", adapter: "sources/licensed.ts#hunterDomainSearch", callSites: ["runEnrich"], status: "ACTIVE", categories: ["email"], note: "Optional, needs HUNTER_API_KEY" },
  { id: "apify", adapter: "sources/apify.ts", callSites: ["runEnrich"], status: "EXPERIMENTAL", categories: ["gap_fill"], note: "Named Actors only, cost-gated" },
  { id: "score_native", adapter: "engines/bin/score", callSites: [], status: "RETIRED", categories: ["scoring"], note: "Unused C++ clamp. Production scoring is targeting/scores.ts + scoring.ts" },
  { id: "traffic_score", adapter: "none", callSites: [], status: "RETIRED", categories: ["traffic"], note: "No traffic source. Field stays null and is not a product capability." },
];

export function runtimeFor(id: string): SourceRuntime | undefined {
  return SOURCE_RUNTIME.find((s) => s.id === id);
}

export function activeSourceIds(): string[] {
  return SOURCE_RUNTIME.filter((s) => s.status === "ACTIVE" || s.status === "EXPERIMENTAL").map((s) => s.id);
}

export function catalogRuntimeStatus(id: string, implemented: boolean, hasCallSite: boolean): RuntimeState {
  const wired = runtimeFor(id);
  if (wired) return wired.status;
  if (!implemented) return "DISABLED";
  if (!hasCallSite) return "DISABLED";
  return "ACTIVE";
}
