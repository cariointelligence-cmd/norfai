/**
 * Reusable Apify platform adapter.
 *
 * Extends Norf collection/enrichment. Never a search engine, never a register
 * of record, never a replacement for YTJ or other official sources.
 *
 * Actors run only when they appear in APIFY_TOOLS with enabled:true, and only
 * after the free Norf stack (YTJ → Finder HTML → harvest → directories).
 * Paid runs are gap-fill: missing website / email / phone. Official facts win.
 *
 * The APIFY_API secret is read only on the server. It is never logged, stored,
 * returned in AdapterResult, or sent to Face.
 */
import { createHash } from "node:crypto";
import type { AdapterHealth, AdapterResult, ObservationInput, SourceState } from "../types.ts";
import { getJson, postJson, type HttpJson } from "../http.ts";
import { reliability } from "./catalog.ts";
import { sourceAllowed, type SourceFlag } from "../immune/flags.ts";
import { canonicalIdentity, sameCanonicalCompany } from "../identity.ts";
import { canonicalCompanyWebsite, isJunkCompanyWebsite, normalizeBusinessId, normalizeDomain, normalizeName, normalizePhone } from "../normalize.ts";
import { emailBelongsToCompany, validEmailSyntax } from "../contacts.ts";
import { coreCompanyName, isDistinctiveCoreName } from "../dedupe.ts";

export const APIFY_SOURCE_ID = "apify";
export const APIFY_PARSER_VERSION = "apify_platform_v1";
export const APIFY_ENV = "APIFY_API";
const APIFY_BASE = "https://api.apify.com/v2";
const APIFY_HOST = "api.apify.com";
const CIRCUIT_FAILS = 5;
const CIRCUIT_OPEN_MS = 10 * 60 * 1000;
const GLOBAL_CONCURRENCY = 2;
const HOURLY_RUN_BUDGET = 24;
const HARD_TIMEOUT_CAP_MS = 180_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_MS = 1_500;
const MAX_DATASET_PAGES = 5;
const REL = reliability("apify");

export const APIFY_FINDER_FI_ID = "finder-fi-scraper";
export const APIFY_FINDER_FI_FALLBACK_ID = "finnish-business-finder-scraper";
export const APIFY_GOOGLE_PLACES_ID = "crawler-google-places";
export const APIFY_LEADS_FINDER_ID = "leads-finder";

export type ApifyUseCase =
  | "discovery"
  | "website_extraction"
  | "contact_enrichment"
  | "social_profiles"
  | "business_directory"
  | "job_postings"
  | "ecommerce"
  | "reviews"
  | "tech_stack"
  | "news_signals"
  | "market_monitoring"
  | "custom_extraction"
  | "scheduled_refresh";

export type ApifyCostClass = "low" | "medium" | "high";

export type ApifyNeed = {
  website: boolean;
  email: boolean;
  phone: boolean;
};

export type ApifyToolDef = {
  connectorId: string;
  actorId?: string;
  taskId?: string;
  name: string;
  useCases: ApifyUseCase[];
  identityFields: string[];
  inputMap: Record<string, string>;
  outputMap: Record<string, string>;
  requiredPermissions: string[];
  costClass: ApifyCostClass;
  freshnessTtlMs: number;
  timeoutMs: number;
  retryMax: number;
  maxItems: number;
  /** 0–100. Must stay below official-register reliability (95). */
  sourceAuthority: number;
  complianceNotes: string;
  enabled: boolean;
};

/**
 * Named Actors only. Do not browse the Store. Both Finder Actors scrape the
 * same public directory — the second is a technical fallback, never a parallel
 * crawl. Google Maps is last-resort website/phone fill, never discovery.
 */
export const APIFY_TOOLS: ApifyToolDef[] = [
  {
    connectorId: APIFY_FINDER_FI_ID,
    actorId: "solidcode~finder-fi-scraper",
    name: "Finder.fi Scraper",
    useCases: ["contact_enrichment", "business_directory"],
    identityFields: ["businessId", "name", "website"],
    inputMap: { query: "keywords", municipality: "location" },
    outputMap: {
      streetAddress: "address",
      postOffice: "municipality",
      city: "municipality",
    },
    requiredPermissions: [],
    costClass: "medium",
    freshnessTtlMs: 24 * 3_600_000,
    timeoutMs: 90_000,
    retryMax: 0,
    maxItems: 3,
    sourceAuthority: 42,
    complianceNotes: "Finder.fi public listings. Not a register of record. One company lookup, max 3 rows. Skip when free Finder HTML already filled the gap.",
    enabled: true,
  },
  {
    connectorId: APIFY_FINDER_FI_FALLBACK_ID,
    actorId: "agenscrape~finnish-business-finder-scraper",
    name: "Finnish Business Finder Scraper",
    useCases: ["contact_enrichment", "business_directory"],
    identityFields: ["businessId", "name", "website"],
    inputMap: { query: "keywords" },
    outputMap: {
      companyOfficialName: "name",
      companyUrl: "website",
      primaryPhone: "phone",
      cityName: "municipality",
      streetAddress: "address",
    },
    requiredPermissions: [],
    costClass: "medium",
    freshnessTtlMs: 24 * 3_600_000,
    timeoutMs: 90_000,
    retryMax: 0,
    maxItems: 3,
    sourceAuthority: 40,
    complianceNotes: "Same Finder.fi directory as finder-fi-scraper. Run only when the primary Actor failed technically, never as a second crawl of the same query.",
    enabled: true,
  },
  {
    connectorId: APIFY_GOOGLE_PLACES_ID,
    actorId: "compass~crawler-google-places",
    name: "Google Maps Scraper",
    useCases: ["contact_enrichment"],
    identityFields: ["name", "website", "phone"],
    inputMap: { query: "searchStringsArray", municipality: "locationQuery" },
    outputMap: {
      title: "name",
      city: "municipality",
      countryCode: "country",
      phoneUnformatted: "phone",
    },
    requiredPermissions: [],
    costClass: "high",
    freshnessTtlMs: 12 * 3_600_000,
    timeoutMs: 120_000,
    retryMax: 0,
    maxItems: 2,
    sourceAuthority: 38,
    complianceNotes: "Google Maps public listing. Last resort for a missing company website. Reviews, leads and social add-ons stay off. maxCrawledPlacesPerSearch=1.",
    enabled: true,
  },
  {
    connectorId: APIFY_LEADS_FINDER_ID,
    actorId: "code_crafter~leads-finder",
    name: "Leads Finder",
    useCases: ["contact_enrichment", "discovery"],
    identityFields: ["name", "website", "email"],
    inputMap: {},
    outputMap: {
      company_name: "name",
      company_website: "website",
      company_domain: "domain",
      company_phone: "phone",
      company_city: "municipality",
      company_country: "country",
      company_street_address: "address",
    },
    requiredPermissions: [],
    costClass: "high",
    freshnessTtlMs: 24 * 3_600_000,
    timeoutMs: 90_000,
    retryMax: 0,
    maxItems: 15,
    sourceAuthority: 44,
    complianceNotes: "Paid Apollo-style lead search. Batch only, never per-company. Skip unless ICP gap + budget. Not a Finnish register of record.",
    enabled: true,
  },
];

export type ApifyNormalizedItem = {
  name: string | null;
  businessId: string | null;
  vatId: string | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  municipality: string | null;
  country: string | null;
  rawKeys: string[];
  confidence: number;
};

export type ApifyRunResult = {
  connectorId: string;
  actorId: string | null;
  taskId: string | null;
  runId: string | null;
  datasetId: string | null;
  status: string;
  items: ApifyNormalizedItem[];
  observations: ObservationInput[];
  cached: boolean;
  retrievedAt: string;
};

export type ApifySkip = {
  ok: true;
  skipped: true;
  reason: string;
  data: [];
  observations: [];
};

export type ApifyUsageSnapshot = {
  runs: number;
  cacheHits: number;
  failures: number;
  skipped: number;
  aborted: number;
  healthProbes: number;
  circuitOpen: boolean;
  approvedTools: number;
  enabledTools: number;
  hourlyRuns: number;
  hourlyBudget: number;
};

export type ApifyPlan = {
  tools: string[];
  reason: string;
};

type Circuit = { fails: number; openedAt: number | null };
type CacheEntry = { at: number; ttl: number; payload: ApifyRunResult };
type Transport = <T>(
  method: "GET" | "POST",
  path: string,
  body: unknown | undefined,
  timeoutMs: number,
) => Promise<HttpJson<T>>;

const circuits = new Map<string, Circuit>();
const cache = new Map<string, CacheEntry>();
const runWindow: number[] = [];
let inflight = 0;
let transportOverride: Transport | null = null;

const usage = {
  runs: 0,
  cacheHits: 0,
  failures: 0,
  skipped: 0,
  aborted: 0,
  healthProbes: 0,
};

function readToken(env: NodeJS.ProcessEnv = process.env): string | null {
  let v = env[APIFY_ENV]?.trim() ?? "";
  if (!v) return null;
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, "").trim();
  return v || null;
}

export function apifyConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readToken(env));
}

export function hasEnabledApifyTools(): boolean {
  return APIFY_TOOLS.some((t) => t.enabled && (t.actorId || t.taskId));
}

export function listApifyTools(): Array<{
  connectorId: string;
  name: string;
  useCases: ApifyUseCase[];
  enabled: boolean;
  costClass: ApifyCostClass;
  hasActor: boolean;
  hasTask: boolean;
}> {
  return APIFY_TOOLS.map((t) => ({
    connectorId: t.connectorId,
    name: t.name,
    useCases: t.useCases,
    enabled: t.enabled,
    costClass: t.costClass,
    hasActor: Boolean(t.actorId),
    hasTask: Boolean(t.taskId),
  }));
}

export function findApifyTool(connectorId: string): ApifyToolDef | undefined {
  return APIFY_TOOLS.find((t) => t.connectorId === connectorId);
}

export function enabledApifyToolsFor(useCase: ApifyUseCase): ApifyToolDef[] {
  return APIFY_TOOLS.filter((t) => t.enabled && t.useCases.includes(useCase) && (t.actorId || t.taskId));
}

export function scrubApifyText(text: string | null | undefined, token?: string | null): string {
  if (!text) return "";
  let s = text;
  const secret = token ?? readToken();
  if (secret && secret.length >= 6) s = s.split(secret).join("[redacted]");
  s = s.replace(/apify_api_[A-Za-z0-9]+/gi, "[redacted]");
  s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  s = s.replace(/APIFY_API/g, "CREDENTIAL");
  return s;
}

function publicApifyUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.toLowerCase() !== APIFY_HOST) return `${APIFY_BASE}`;
    u.searchParams.delete("token");
    u.username = "";
    u.password = "";
    return `${u.origin}${u.pathname}`;
  } catch {
    return APIFY_BASE;
  }
}

function encodeResourceId(id: string): string {
  return encodeURIComponent(id.trim().replace("/", "~"));
}

function boundInput(input: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth > 4) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input).slice(0, 40)) {
    const v = input[key];
    if (typeof v === "string") out[key] = v.slice(0, 2000);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean" || v === null) out[key] = v;
    else if (Array.isArray(v)) out[key] = v.slice(0, 50).map((item) => {
      if (typeof item === "string") return item.slice(0, 500);
      if (item && typeof item === "object" && !Array.isArray(item)) return boundInput(item as Record<string, unknown>, depth + 1);
      if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
      return null;
    });
    else if (v && typeof v === "object") out[key] = boundInput(v as Record<string, unknown>, depth + 1);
  }
  return out;
}

function asPositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Hard caps so a mistaken input cannot start a directory crawl. */
export function clampApifyRunInput(tool: ApifyToolDef, input: Record<string, unknown>): Record<string, unknown> {
  const out = boundInput(input);
  const cap = Math.max(1, Math.min(tool.maxItems || 3, 5));
  if (Array.isArray(out.keywords)) out.keywords = (out.keywords as unknown[]).slice(0, 1);
  if (Array.isArray(out.searchUrls)) out.searchUrls = (out.searchUrls as unknown[]).slice(0, 1);
  if (Array.isArray(out.searchStringsArray)) out.searchStringsArray = (out.searchStringsArray as unknown[]).slice(0, 1);
  if (Array.isArray(out.startUrls)) out.startUrls = (out.startUrls as unknown[]).slice(0, 1);
  if (Array.isArray(out.placeIds)) out.placeIds = (out.placeIds as unknown[]).slice(0, 1);
  if ("maxResults" in out || tool.connectorId === APIFY_FINDER_FI_ID) {
    out.maxResults = Math.min(asPositiveInt(out.maxResults, cap), cap);
  }
  if ("maxResultsPerKeyword" in out || tool.connectorId === APIFY_FINDER_FI_FALLBACK_ID) {
    out.maxResultsPerKeyword = Math.min(asPositiveInt(out.maxResultsPerKeyword, cap), cap);
  }
  if ("maxCrawledPlacesPerSearch" in out || tool.connectorId === APIFY_GOOGLE_PLACES_ID) {
    out.maxCrawledPlacesPerSearch = Math.min(asPositiveInt(out.maxCrawledPlacesPerSearch, 1), 1);
  }
  if (tool.connectorId === APIFY_LEADS_FINDER_ID) {
    const cap = Math.max(1, Math.min(tool.maxItems || 15, 15));
    out.fetch_count = Math.min(asPositiveInt(out.fetch_count, cap), cap);
    delete out.maxResults;
  }
  if ("includePeople" in out || tool.connectorId === APIFY_FINDER_FI_ID) out.includePeople = false;
  if (tool.connectorId === APIFY_GOOGLE_PLACES_ID) {
    out.scrapeContacts = false;
    out.scrapePlaceDetailPage = false;
    out.includeWebResults = false;
    out.scrapeDirectories = false;
    out.enableCompetitorAnalysis = false;
    out.maxReviews = 0;
    out.maxImages = 0;
    out.maxQuestions = 0;
    out.maximumLeadsEnrichmentRecords = 0;
  }
  return boundInput(out);
}

export function validateApifyInput(
  tool: ApifyToolDef,
  input: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Input must be an object" };
  }
  return { ok: true, value: clampApifyRunInput(tool, input as Record<string, unknown>) };
}

export function needsPaidApifyFill(need: ApifyNeed): boolean {
  return Boolean(need.website || need.email || need.phone);
}

export function planApifyEnrichment(opts: {
  name: string;
  country?: string | null;
  municipality?: string | null;
  businessId?: string | null;
  missing: ApifyNeed;
}): ApifyPlan {
  if (!opts.name.trim()) return { tools: [], reason: "no_name" };
  if (!needsPaidApifyFill(opts.missing)) return { tools: [], reason: "already_filled" };
  const country = (opts.country ?? "FI").trim().toUpperCase() || "FI";
  if (country !== "FI") return { tools: [], reason: "out_of_coverage" };
  const tools: string[] = [];
  if (opts.missing.website || opts.missing.email || opts.missing.phone) {
    if (findApifyTool(APIFY_FINDER_FI_ID)?.enabled) tools.push(APIFY_FINDER_FI_ID);
  }
  if (opts.missing.website && findApifyTool(APIFY_GOOGLE_PLACES_ID)?.enabled) {
    tools.push(APIFY_GOOGLE_PLACES_ID);
  }
  if (!tools.length) return { tools: [], reason: "no_approved_tools" };
  return { tools, reason: "gap_fill" };
}

export function buildApprovedApifyInput(
  tool: ApifyToolDef,
  ctx: {
    name: string;
    municipality?: string | null;
    website?: string | null;
    businessId?: string | null;
    country?: string | null;
    street?: string | null;
  },
): Record<string, unknown> {
  const name = ctx.name.trim().slice(0, 200);
  const city = (ctx.municipality ?? "").trim().slice(0, 80);
  const cap = Math.max(1, Math.min(tool.maxItems || 3, 5));
  if (tool.connectorId === APIFY_FINDER_FI_ID) {
    return clampApifyRunInput(tool, {
      keywords: [name],
      location: city,
      includePeople: false,
      maxResults: cap,
    });
  }
  if (tool.connectorId === APIFY_FINDER_FI_FALLBACK_ID) {
    return clampApifyRunInput(tool, {
      keywords: [city ? `${name} ${city}` : name],
      maxResultsPerKeyword: cap,
    });
  }
  if (tool.connectorId === APIFY_GOOGLE_PLACES_ID) {
    const loc = city ? `${city}, Finland` : "Finland";
    const search = city ? `${name}, ${city}` : name;
    return clampApifyRunInput(tool, {
      searchStringsArray: [search],
      locationQuery: loc,
      maxCrawledPlacesPerSearch: 1,
      language: "fi",
      countryCode: "fi",
      searchMatching: "only_includes",
      scrapePlaceDetailPage: false,
      includeWebResults: false,
      scrapeContacts: false,
      scrapeDirectories: false,
      skipClosedPlaces: true,
      maxReviews: 0,
      maxImages: 0,
      maxQuestions: 0,
      maximumLeadsEnrichmentRecords: 0,
      enableCompetitorAnalysis: false,
      website: "allPlaces",
    });
  }
  if (tool.connectorId === APIFY_LEADS_FINDER_ID) {
    return clampApifyRunInput(tool, { fetch_count: 1 });
  }
  const input: Record<string, unknown> = {};
  if (ctx.website) input.startUrl = ctx.website;
  if (name) input.query = name;
  if (ctx.businessId) input.businessId = ctx.businessId;
  return clampApifyRunInput(tool, input);
}

function cacheKey(connectorId: string, input: Record<string, unknown>): string {
  const h = createHash("sha256");
  h.update(connectorId);
  h.update("\n");
  h.update(stableJson(input));
  return h.digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(rec[k])}`).join(",")}}`;
}

function pruneCache(now = Date.now()): void {
  for (const [k, v] of cache) {
    if (now - v.at > v.ttl) cache.delete(k);
  }
}

function circuitOk(id: string, now = Date.now()): boolean {
  const c = circuits.get(id);
  if (!c?.openedAt) return true;
  if (now - c.openedAt >= CIRCUIT_OPEN_MS) {
    circuits.set(id, { fails: 0, openedAt: null });
    return true;
  }
  return false;
}

function circuitFail(id: string, now = Date.now()): void {
  const cur = circuits.get(id) ?? { fails: 0, openedAt: null };
  const fails = cur.fails + 1;
  circuits.set(id, { fails, openedAt: fails >= CIRCUIT_FAILS ? now : cur.openedAt });
}

function circuitSuccess(id: string): void {
  circuits.set(id, { fails: 0, openedAt: null });
}

export function apifyCircuitOpen(id = APIFY_SOURCE_ID): boolean {
  return !circuitOk(id);
}

function pruneRunWindow(now = Date.now()): void {
  while (runWindow.length && now - runWindow[0]! > 3_600_000) runWindow.shift();
}

function hourlyBudgetLeft(now = Date.now()): number {
  pruneRunWindow(now);
  return Math.max(0, HOURLY_RUN_BUDGET - runWindow.length);
}

async function defaultTransport<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown | undefined,
  timeoutMs: number,
): Promise<HttpJson<T>> {
  const token = readToken();
  if (!token) {
    return { ok: false, status: 0, url: APIFY_BASE, error: "Optional connector is on standby", latencyMs: 0 };
  }
  const url = `${APIFY_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let hostOk = false;
  try {
    hostOk = new URL(url).hostname.toLowerCase() === APIFY_HOST;
  } catch {
    hostOk = false;
  }
  if (!hostOk) {
    return { ok: false, status: 0, url: APIFY_BASE, error: "Blocked host", latencyMs: 0 };
  }
  const headers = { Authorization: `Bearer ${token}` };
  const raw = method === "GET"
    ? await getJson<T>(url, { headers, timeoutMs })
    : await postJson<T>(url, body ?? {}, { headers, timeoutMs });
  if (!raw.ok) {
    return { ...raw, url: publicApifyUrl(raw.url), error: scrubApifyText(raw.error, token) };
  }
  return { ...raw, url: publicApifyUrl(raw.url) };
}

function transport(): Transport {
  return (transportOverride ?? defaultTransport) as Transport;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function pickStr(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickEmail(mapped: Record<string, unknown>): string | null {
  const direct = pickStr(mapped, ["email", "contactEmail", "primaryEmail"]);
  if (direct && validEmailSyntax(direct)) return direct.toLowerCase();
  for (const key of ["emails", "emailList"]) {
    const v = mapped[key];
    if (typeof v === "string" && validEmailSyntax(v)) return v.toLowerCase();
    if (!Array.isArray(v)) continue;
    for (const item of v.slice(0, 5)) {
      if (typeof item === "string" && validEmailSyntax(item)) return item.toLowerCase();
      const rec = asRecord(item);
      const nested = rec ? pickStr(rec, ["email", "value", "address"]) : null;
      if (nested && validEmailSyntax(nested)) return nested.toLowerCase();
    }
  }
  return null;
}

function authorityOf(tool: ApifyToolDef): number {
  return Math.max(10, Math.min(60, Math.round(tool.sourceAuthority || REL)));
}

export function normalizeApifyItem(raw: unknown, tool: ApifyToolDef): ApifyNormalizedItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const recordType = pickStr(row, ["recordType", "type"]);
  if (recordType && /person|individual/i.test(recordType) && tool.connectorId !== APIFY_LEADS_FINDER_ID) return null;
  const mapped: Record<string, unknown> = { ...row };
  for (const [from, to] of Object.entries(tool.outputMap ?? {})) {
    if (from in row && !(to in mapped)) mapped[to] = row[from];
  }
  const name = pickStr(mapped, ["name", "companyName", "company_name", "legalName", "companyOfficialName", "title", "company"]);
  const businessId = normalizeBusinessId(
    pickStr(mapped, ["businessId", "business_id", "yTunnus", "ytunnus", "companyNumber", "orgNumber", "vatNumber"]),
  );
  const vatId = pickStr(mapped, ["vatId", "vat_id", "vat"]) ?? null;
  const websiteRaw = pickStr(mapped, ["website", "companyWebsite", "company_website", "companyUrl", "homepage"])
    ?? pickStr(mapped, ["url", "domain", "company_domain"]);
  const website = websiteRaw && !isJunkCompanyWebsite(websiteRaw) ? canonicalCompanyWebsite(websiteRaw) : null;
  const domain = website ? normalizeDomain(website) : normalizeDomain(pickStr(mapped, ["domain", "company_domain"]) ?? "");
  const email = pickEmail(mapped);
  const phone = normalizePhone(pickStr(mapped, ["phone", "telephone", "tel", "primaryPhone", "phoneUnformatted", "mobile", "company_phone"]) ?? "");
  const address = pickStr(mapped, ["address", "street", "streetAddress", "registeredAddress", "company_street_address", "company_full_address"]);
  const municipality = pickStr(mapped, ["municipality", "city", "cityName", "postOffice", "locality", "company_city"]);
  const countryRaw = pickStr(mapped, ["country", "countryCode", "company_country"]) ?? "FI";
  const country = /^(fi|fin|finland|suomi)/i.test(countryRaw) ? "FI" : countryRaw.slice(0, 2).toUpperCase();
  if (!name && !businessId && !website && !email && !phone) return null;
  const idStrength = businessId ? 8 : website ? 5 : email ? 3 : 0;
  return {
    name: name ? name.slice(0, 200) : null,
    businessId,
    vatId,
    website,
    domain: domain || null,
    email,
    phone: phone || null,
    address,
    municipality,
    country,
    rawKeys: Object.keys(row).slice(0, 40),
    confidence: Math.min(authorityOf(tool), 40 + idStrength),
  };
}

export function apifyItemMatchesCompany(
  item: ApifyNormalizedItem,
  company: { name?: string | null; businessId?: string | null; website?: string | null; country?: string | null; municipality?: string | null },
): { match: boolean; rationale: string; strength: string } {
  const a = {
    name: item.name ?? "",
    businessId: item.businessId,
    domain: item.domain,
    country: item.country,
  };
  const b = {
    name: company.name ?? "",
    businessId: company.businessId ?? null,
    domain: company.website ? normalizeDomain(company.website) : null,
    country: company.country ?? null,
  };
  if (a.businessId && b.businessId) {
    if (a.businessId === b.businessId) return { match: true, rationale: "businessId", strength: "registry" };
    return { match: false, rationale: "businessId conflict", strength: "registry" };
  }
  if (sameCanonicalCompany(a, b)) {
    const id = canonicalIdentity(a);
    return { match: true, rationale: id.strength, strength: id.strength };
  }
  if (item.email && company.name && emailBelongsToCompany(item.email, { name: company.name, website: company.website ?? undefined })) {
    return { match: true, rationale: "mailbox belongs to company", strength: "domain" };
  }
  if (item.name && company.name && normalizeName(item.name) === normalizeName(company.name) && item.domain && b.domain && item.domain === b.domain) {
    return { match: true, rationale: "name+domain", strength: "domain" };
  }
  const coreA = item.name ? coreCompanyName(item.name) : "";
  const coreB = company.name ? coreCompanyName(company.name) : "";
  if (coreA && coreB && coreA === coreB && isDistinctiveCoreName(coreA)) {
    const cityA = item.municipality ? normalizeName(item.municipality) : "";
    const cityB = company.municipality ? normalizeName(company.municipality) : "";
    if (cityA && cityB && cityA !== cityB) return { match: false, rationale: "city conflict", strength: "name" };
    return { match: true, rationale: cityA && cityB ? "name+city" : "distinctive name", strength: "name" };
  }
  return { match: false, rationale: "no shared identifier", strength: "name" };
}

export function selectPreferredFact(opts: {
  official: string | null | undefined;
  apify: string | null | undefined;
  field: string;
}): { value: string | null; preferred: "official" | "apify" | "none"; conflict: boolean; rationale: string } {
  const official = typeof opts.official === "string" && opts.official.trim() ? opts.official.trim() : null;
  const apify = typeof opts.apify === "string" && opts.apify.trim() ? opts.apify.trim() : null;
  if (!official && !apify) return { value: null, preferred: "none", conflict: false, rationale: "unknown" };
  if (official && !apify) return { value: official, preferred: "official", conflict: false, rationale: "official registry" };
  if (!official && apify) return { value: apify, preferred: "apify", conflict: false, rationale: "apify fill; official unknown" };
  if (official === apify) return { value: official, preferred: "official", conflict: false, rationale: "agreement" };
  return {
    value: official,
    preferred: "official",
    conflict: true,
    rationale: `official ${opts.field} kept; apify disagreed`,
  };
}

function observationsFrom(
  items: ApifyNormalizedItem[],
  tool: ApifyToolDef,
  datasetId: string | null,
): ObservationInput[] {
  const out: ObservationInput[] = [];
  for (const item of items.slice(0, tool.maxItems || 50)) {
    const pairs: Array<[string, string | null]> = [
      ["name", item.name],
      ["business_id", item.businessId],
      ["website", item.website],
      ["email", item.email],
      ["phone", item.phone],
    ];
    for (const [field, value] of pairs) {
      if (!value) continue;
      out.push({
        field,
        rawValue: value,
        normalisedValue: value,
        confidence: item.confidence,
        sourceReliability: REL,
        extractionMethod: `apify:${tool.connectorId}:${APIFY_PARSER_VERSION}`,
        sourceUrl: null,
        datasetId,
        licence: "Apify actor output; not a register of record",
        verificationStatus: "published",
        evidence: `Approved collection layer (${tool.connectorId})`,
      });
    }
  }
  return out.slice(0, 80);
}

function failResult(error: string, state?: SourceState): AdapterResult<ApifyRunResult> {
  usage.failures += 1;
  return { ok: false, error: scrubApifyText(error), state };
}

export async function apifyHealth(): Promise<AdapterHealth & { ok: boolean; detail: string }> {
  usage.healthProbes += 1;
  const t0 = Date.now();
  if (!apifyConfigured()) {
    return {
      sourceId: APIFY_SOURCE_ID,
      state: "optional_offline",
      latencyMs: Date.now() - t0,
      detail: "Optional connector is on standby",
      checkedAt: new Date().toISOString(),
      ok: false,
    };
  }
  if (!circuitOk(APIFY_SOURCE_ID)) {
    return {
      sourceId: APIFY_SOURCE_ID,
      state: "temporarily_unavailable",
      latencyMs: Date.now() - t0,
      detail: "Circuit open",
      checkedAt: new Date().toISOString(),
      ok: false,
    };
  }
  const r = await transport()<{ data?: { username?: string; id?: string } }>("GET", "/users/me", undefined, 12_000);
  const ok = r.ok && Boolean(r.data?.data?.username || r.data?.data?.id || asRecord(r.data)?.username);
  if (ok) circuitSuccess(APIFY_SOURCE_ID);
  else circuitFail(APIFY_SOURCE_ID);
  const state: SourceState = ok
    ? "connected"
    : r.status === 429
      ? "rate_limited"
      : r.status === 401 || r.status === 403
        ? "optional_offline"
        : "temporarily_unavailable";
  return {
    sourceId: APIFY_SOURCE_ID,
    state,
    latencyMs: r.ok ? r.latencyMs : r.latencyMs,
    detail: ok ? "Platform reachable" : scrubApifyText(r.ok ? "Unexpected payload" : r.error),
    checkedAt: new Date().toISOString(),
    ok,
  };
}

export async function runApprovedApifyTool(opts: {
  connectorId: string;
  input: Record<string, unknown>;
  flags?: Map<string, SourceFlag> | null;
}): Promise<AdapterResult<ApifyRunResult> | ApifySkip> {
  const tool = findApifyTool(opts.connectorId);
  if (!tool) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: "unknown_tool", data: [], observations: [] };
  }
  if (!tool.enabled || !(tool.actorId || tool.taskId)) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: "tool_disabled", data: [], observations: [] };
  }
  if (!sourceAllowed(opts.flags, APIFY_SOURCE_ID)) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: "kill_switch", data: [], observations: [] };
  }
  if (!apifyConfigured()) {
    return failResult("Optional connector is on standby", "optional_offline");
  }
  if (!circuitOk(APIFY_SOURCE_ID) || !circuitOk(tool.connectorId)) {
    return failResult("Circuit open", "temporarily_unavailable");
  }
  const checked = validateApifyInput(tool, opts.input);
  if (!checked.ok) return failResult(checked.error);
  const key = cacheKey(tool.connectorId, checked.value);
  pruneCache();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    usage.cacheHits += 1;
    return { ok: true, data: { ...hit.payload, cached: true }, observations: hit.payload.observations, sourceUrl: APIFY_BASE };
  }
  if (hourlyBudgetLeft() <= 0) {
    return failResult("Hourly Apify budget exhausted", "rate_limited");
  }
  if (inflight >= GLOBAL_CONCURRENCY) {
    return failResult("Apify concurrency limit", "rate_limited");
  }

  inflight += 1;
  runWindow.push(Date.now());
  usage.runs += 1;
  const timeoutMs = Math.max(5_000, Math.min(HARD_TIMEOUT_CAP_MS, tool.timeoutMs || DEFAULT_TIMEOUT_MS));
  const retries = Math.max(0, Math.min(2, tool.retryMax ?? 1));
  try {
    let lastError = "Request failed";
    let lastState: SourceState | undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
      const started = await startRun(tool, checked.value, timeoutMs);
      if (!started.ok) {
        lastError = started.error;
        lastState = started.state;
        if (started.state === "optional_offline" || started.state === "access_prohibited") break;
        circuitFail(tool.connectorId);
        circuitFail(APIFY_SOURCE_ID);
        continue;
      }
      const finished = await waitForRun(started.runId, timeoutMs);
      if (!finished.ok) {
        lastError = finished.error;
        lastState = finished.state;
        if (finished.state === "temporarily_unavailable") {
          await abortRun(started.runId);
          usage.aborted += 1;
        }
        circuitFail(tool.connectorId);
        circuitFail(APIFY_SOURCE_ID);
        continue;
      }
      if (finished.status !== "SUCCEEDED") {
        lastError = `Run ${finished.status}`;
        lastState = "temporarily_unavailable";
        circuitFail(tool.connectorId);
        continue;
      }
      const items = await fetchDatasetItems(finished.datasetId, tool.maxItems || 50);
      const normalised = items
        .map((row) => normalizeApifyItem(row, tool))
        .filter((row): row is ApifyNormalizedItem => Boolean(row))
        .slice(0, tool.maxItems || 50);
      const observations = observationsFrom(normalised, tool, finished.datasetId);
      const payload: ApifyRunResult = {
        connectorId: tool.connectorId,
        actorId: tool.actorId ?? null,
        taskId: tool.taskId ?? null,
        runId: started.runId,
        datasetId: finished.datasetId,
        status: finished.status,
        items: normalised,
        observations,
        cached: false,
        retrievedAt: new Date().toISOString(),
      };
      cache.set(key, { at: Date.now(), ttl: Math.max(60_000, tool.freshnessTtlMs || 6 * 3600_000), payload });
      circuitSuccess(tool.connectorId);
      circuitSuccess(APIFY_SOURCE_ID);
      return { ok: true, data: payload, observations, sourceUrl: APIFY_BASE };
    }
    return failResult(lastError, lastState);
  } finally {
    inflight = Math.max(0, inflight - 1);
  }
}

type StartOk = { ok: true; runId: string };
type StartFail = { ok: false; error: string; state?: SourceState };

async function startRun(tool: ApifyToolDef, input: Record<string, unknown>, timeoutMs: number): Promise<StartOk | StartFail> {
  const waitSec = Math.max(0, Math.min(60, Math.floor(timeoutMs / 1000)));
  const path = tool.taskId
    ? `/actor-tasks/${encodeResourceId(tool.taskId)}/runs?waitForFinish=${waitSec}`
    : `/acts/${encodeResourceId(tool.actorId!)}/runs?waitForFinish=${waitSec}`;
  const r = await transport()<{ data?: { id?: string; status?: string; defaultDatasetId?: string } }>(
    "POST",
    path,
    input,
    Math.min(timeoutMs + 5_000, HARD_TIMEOUT_CAP_MS),
  );
  if (!r.ok) {
    const state: SourceState | undefined =
      r.status === 429 ? "rate_limited"
        : r.status === 401 || r.status === 403 ? "optional_offline"
          : r.status >= 500 ? "temporarily_unavailable"
            : undefined;
    return { ok: false, error: r.error, state };
  }
  const id = r.data?.data?.id;
  if (!id) return { ok: false, error: "Run did not return an id" };
  return { ok: true, runId: String(id) };
}

async function waitForRun(
  runId: string,
  timeoutMs: number,
): Promise<{ ok: true; status: string; datasetId: string | null } | { ok: false; error: string; state?: SourceState }> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "RUNNING";
  let datasetId: string | null = null;
  while (Date.now() < deadline) {
    const r = await transport()<{
      data?: { status?: string; defaultDatasetId?: string };
    }>("GET", `/actor-runs/${encodeResourceId(runId)}`, undefined, 15_000);
    if (!r.ok) {
      if (r.status === 429) return { ok: false, error: "Rate limited", state: "rate_limited" };
      await sleep(POLL_MS);
      continue;
    }
    lastStatus = String(r.data?.data?.status ?? lastStatus);
    datasetId = r.data?.data?.defaultDatasetId ? String(r.data.data.defaultDatasetId) : datasetId;
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(lastStatus)) {
      return { ok: true, status: lastStatus, datasetId };
    }
    await sleep(POLL_MS);
  }
  return { ok: false, error: "Timed out waiting for run", state: "temporarily_unavailable" };
}

async function abortRun(runId: string): Promise<void> {
  try {
    await transport()("POST", `/actor-runs/${encodeResourceId(runId)}/abort`, {}, 10_000);
  } catch {
    /* ignore */
  }
}

async function fetchDatasetItems(datasetId: string | null, limit: number): Promise<unknown[]> {
  if (!datasetId) return [];
  const cap = Math.max(1, Math.min(200, limit));
  const out: unknown[] = [];
  for (let page = 0; page < MAX_DATASET_PAGES && out.length < cap; page += 1) {
    const offset = page * Math.min(100, cap);
    const remain = cap - out.length;
    const r = await transport()<unknown>(
      "GET",
      `/datasets/${encodeResourceId(datasetId)}/items?format=json&clean=1&limit=${remain}&offset=${offset}`,
      undefined,
      20_000,
    );
    if (!r.ok) break;
    const rows = Array.isArray(r.data) ? r.data : [];
    out.push(...rows);
    if (rows.length < remain) break;
  }
  return out.slice(0, cap);
}

function matchedFill(item: ApifyNormalizedItem, company: {
  name: string;
  businessId?: string | null;
  website?: string | null;
  country?: string | null;
  municipality?: string | null;
}): ApifyNormalizedItem | null {
  const m = apifyItemMatchesCompany(item, company);
  if (!m.match) return null;
  if (item.email && company.name && !emailBelongsToCompany(item.email, { name: company.name, website: company.website ?? undefined })) {
    return { ...item, email: null };
  }
  const website = selectPreferredFact({ official: company.website, apify: item.website, field: "website" });
  return { ...item, website: website.value };
}

export async function applyApifyEnrichment(opts: {
  name: string;
  businessId?: string | null;
  website?: string | null;
  country?: string | null;
  municipality?: string | null;
  street?: string | null;
  missing?: ApifyNeed;
  flags?: Map<string, SourceFlag> | null;
}): Promise<ApifySkip | AdapterResult<ApifyNormalizedItem[]>> {
  const missing: ApifyNeed = opts.missing ?? {
    website: !canonicalCompanyWebsite(opts.website),
    email: true,
    phone: true,
  };
  const plan = planApifyEnrichment({
    name: opts.name,
    country: opts.country,
    municipality: opts.municipality,
    businessId: opts.businessId,
    missing,
  });
  if (!plan.tools.length) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: plan.reason, data: [], observations: [] };
  }
  if (!sourceAllowed(opts.flags, APIFY_SOURCE_ID)) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: "kill_switch", data: [], observations: [] };
  }

  const company = {
    name: opts.name,
    businessId: opts.businessId ?? null,
    website: canonicalCompanyWebsite(opts.website),
    country: opts.country ?? "FI",
    municipality: opts.municipality ?? null,
  };
  const still: ApifyNeed = { ...missing };
  const merged: ApifyNormalizedItem[] = [];
  const observations: ObservationInput[] = [];

  const absorb = (items: ApifyNormalizedItem[], obs: ObservationInput[]) => {
    for (const item of items) {
      const kept = matchedFill(item, company);
      if (!kept) continue;
      if (kept.website) still.website = false;
      if (kept.email) still.email = false;
      if (kept.phone) still.phone = false;
      merged.push(kept);
    }
    observations.push(...obs);
  };

  const runOne = async (connectorId: string): Promise<"matched" | "empty" | "failed" | "skipped"> => {
    const tool = findApifyTool(connectorId);
    if (!tool?.enabled) return "skipped";
    const input = buildApprovedApifyInput(tool, opts);
    const ran = await runApprovedApifyTool({ connectorId, input, flags: opts.flags });
    if ("skipped" in ran && ran.skipped) return "skipped";
    if (!ran.ok) return "failed";
    absorb(ran.data.items, ran.observations);
    return ran.data.items.some((item) => apifyItemMatchesCompany(item, company).match) ? "matched" : "empty";
  };

  if (plan.tools.includes(APIFY_FINDER_FI_ID) && (still.website || still.email || still.phone)) {
    const primary = await runOne(APIFY_FINDER_FI_ID);
    if (primary === "failed" && (still.website || still.email || still.phone)) {
      await runOne(APIFY_FINDER_FI_FALLBACK_ID);
    }
  }

  if (plan.tools.includes(APIFY_GOOGLE_PLACES_ID) && still.website) {
    await runOne(APIFY_GOOGLE_PLACES_ID);
  }

  if (!merged.length) {
    usage.skipped += 1;
    return { ok: true, skipped: true, reason: "no_identity_match", data: [], observations: [] };
  }
  return { ok: true, data: merged, observations };
}

export function apifyUsageSnapshot(): ApifyUsageSnapshot {
  return {
    runs: usage.runs,
    cacheHits: usage.cacheHits,
    failures: usage.failures,
    skipped: usage.skipped,
    aborted: usage.aborted,
    healthProbes: usage.healthProbes,
    circuitOpen: apifyCircuitOpen(),
    approvedTools: APIFY_TOOLS.length,
    enabledTools: APIFY_TOOLS.filter((t) => t.enabled).length,
    hourlyRuns: HOURLY_RUN_BUDGET - hourlyBudgetLeft(),
    hourlyBudget: HOURLY_RUN_BUDGET,
  };
}

/** Test hook. Production never calls this. */
export function __replaceApifyToolsForTests(next: ApifyToolDef[]): () => void {
  const prev = APIFY_TOOLS.splice(0, APIFY_TOOLS.length, ...next);
  return () => {
    APIFY_TOOLS.splice(0, APIFY_TOOLS.length, ...prev);
  };
}

/** Test hook. Production never calls this. */
export function __setApifyTransportForTests(fn: Transport | null): void {
  transportOverride = fn;
}

/** Test hook. Production never calls this. */
export function __resetApifyStateForTests(): void {
  circuits.clear();
  cache.clear();
  runWindow.length = 0;
  inflight = 0;
  usage.runs = 0;
  usage.cacheHits = 0;
  usage.failures = 0;
  usage.skipped = 0;
  usage.aborted = 0;
  usage.healthProbes = 0;
  transportOverride = null;
}

/** Test hook to trip the circuit without a live run. */
export function __tripApifyCircuitForTests(id = APIFY_SOURCE_ID): void {
  circuits.set(id, { fails: CIRCUIT_FAILS, openedAt: Date.now() });
}
