/**
 * First-party public collectors. Licensed APIs stay optional upgrades.
 * These parsers never invent companies, emails, phones or revenue.
 */
import type { AdapterResult, ContactHit, DiscoveredCompany, ObservationInput } from "../types.ts";
import { extractEmails, isJunkEmail, isBillingEmail, isRecruitingEmail } from "../contacts.ts";
import { extractFinancialMentions } from "../targeting/website.ts";
import { normalizeBusinessId, normalizeDomain } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { getJson } from "../http.ts";
import { cacheKey, readCache, writeCache } from "../cache-policy.ts";
import { financialEmptyReason } from "../financial-fusion.ts";
import { classifyHiringCategory, hiringFreshness, type HiringCategory, type HiringFreshness } from "../hiring-signal.ts";
import { coreCompanyName } from "../dedupe.ts";
import { duckDuckGoHtmlSearch } from "./webdiscover.ts";
import { kauppalehtiLookup } from "./kauppalehti.ts";
import { northdataLookup } from "./northdata.ts";
import { reliability } from "./catalog.ts";

async function fetchHtml(url: string, timeoutMs = 10000): Promise<{ ok: true; body: string; url: string } | { ok: false; error: string; status: number }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 1_200_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "fi-FI,fi,en;q=0.8" },
    });
    if (res.status >= 400) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    return { ok: true, body: res.body, url: res.url || url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed", status: 0 };
  }
}

function decodeHref(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/&/gi, "&").replace(/&#x2F;/gi, "/").replace(/"/gi, '"'));
  } catch {
    return raw.replace(/&/gi, "&");
  }
}

export function parseOpenCorporatesHtml(html: string): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const re = /href="(\/companies\/([a-z]{2})\/([^"]+))"[^>]*>([^<]{2,120})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const jur = (m[2] ?? "").toLowerCase();
    const num = decodeURIComponent(m[3] ?? "").split("?")[0] ?? "";
    const name = (m[4] ?? "").replace(/\s+/g, " ").trim();
    if (!name || name.length < 2) continue;
    const key = `${jur}:${num}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const country = jur.toUpperCase();
    const bid = country === "FI" ? normalizeBusinessId(num) : num;
    out.push({
      name,
      businessId: bid,
      country: country === "UK" ? "GB" : country,
      website: null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export function parseCompaniesHouseHtml(html: string): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const re = /href="\/company\/([A-Z0-9]{6,8})"[^>]*>\s*([^<]{2,160})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const num = (m[1] ?? "").toUpperCase();
    const name = (m[2] ?? "").replace(/\s+/g, " ").trim();
    if (!num || !name || seen.has(num)) continue;
    seen.add(num);
    out.push({ name, businessId: num, country: "GB", website: null });
    if (out.length >= 12) break;
  }
  return out;
}

export function parseAllabolagHtml(html: string): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const re = /href="\/(\d{10})[_/]([^"]+)"[^>]*>\s*([^<]{2,160})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const org = m[1] ?? "";
    const name = (m[3] ?? "").replace(/\s+/g, " ").trim() || decodeURIComponent((m[2] ?? "").replace(/_/g, " "));
    if (!org || !name || seen.has(org)) continue;
    seen.add(org);
    out.push({ name, businessId: org, country: "SE", vatId: `SE${org}`, website: null });
    if (out.length >= 12) break;
  }
  return out;
}

export function registerPortalFor(country: string, name?: string, businessId?: string): { url: string; register: string } {
  const c = (country || "FI").toUpperCase();
  const q = encodeURIComponent(name || businessId || "");
  if (c === "FI") {
    const bid = businessId ? encodeURIComponent(businessId) : "";
    return {
      register: "Finnish Trade Register (YTJ)",
      url: bid
        ? `https://tietopalvelu.ytj.fi/yritystiedot.aspx?y-tunnus=${bid}`
        : `https://tietopalvelu.ytj.fi/`,
    };
  }
  if (c === "SE") {
    return { register: "Allabolag public cards (Bolagsverket has no bulk open API)", url: `https://www.allabolag.se/what/${q}` };
  }
  if (c === "NO") {
    return { register: "Brønnøysund", url: `https://virksomhet.brreg.no/nb/oppslag/enheter?q=${q}` };
  }
  if (c === "DK") {
    return { register: "CVR", url: `https://datacvr.virk.dk/data/visenhed?searchTerm=${q}` };
  }
  if (c === "GB") {
    return { register: "UK Companies House", url: `https://find-and-update.company-information.service.gov.uk/search/companies?q=${q}` };
  }
  return {
    register: "EU e-Justice business registers",
    url: "https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-search-network_en",
  };
}

export async function openCorporatesPublic(query: string, jurisdiction = "fi"): Promise<AdapterResult<DiscoveredCompany[]>> {
  const q = query.trim();
  if (q.length < 2) return { ok: false, error: "Query too short" };
  const jur = jurisdiction.toLowerCase();
  const api = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(q)}&jurisdiction_code=${encodeURIComponent(jur)}&per_page=8`;
  const json = await getJson<{
    results?: { companies?: Array<{ company?: { name?: string; company_number?: string; jurisdiction_code?: string; current_status?: string } }> };
  }>(api, { timeoutMs: 8000 });
  if (json.ok) {
    const data: DiscoveredCompany[] = (json.data.results?.companies ?? [])
      .map((row) => row.company)
      .filter((c): c is NonNullable<typeof c> => Boolean(c?.name))
      .map((c) => ({
        name: c.name!,
        businessId: (c.jurisdiction_code ?? jur) === "fi" ? normalizeBusinessId(c.company_number ?? null) : (c.company_number ?? null),
        country: (c.jurisdiction_code ?? jur).slice(0, 2).toUpperCase(),
        businessStatus: c.current_status ?? null,
      }));
    if (data.length) return { ok: true, data, observations: [], sourceUrl: api.split("?")[0] };
  }
  const htmlUrl = `https://opencorporates.com/companies?q=${encodeURIComponent(q)}&jurisdiction_code=${encodeURIComponent(jur)}`;
  const page = await fetchHtml(htmlUrl, 10000);
  if (!page.ok) return { ok: false, error: page.error, state: page.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const data = parseOpenCorporatesHtml(page.body);
  return { ok: true, data, observations: [], sourceUrl: htmlUrl };
}

export async function companiesHousePublic(query: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const q = query.trim();
  if (q.length < 2) return { ok: false, error: "Query too short" };
  const url = `https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}`;
  const page = await fetchHtml(url, 10000);
  if (!page.ok) return { ok: false, error: page.error, state: "temporarily_unavailable" };
  const data = parseCompaniesHouseHtml(page.body);
  return { ok: true, data, observations: [], sourceUrl: url };
}

export async function bolagsverketSearch(query: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const q = query.trim();
  if (q.length < 2) return { ok: false, error: "Query too short" };
  const url = `https://www.allabolag.se/what/${encodeURIComponent(q)}`;
  const page = await fetchHtml(url, 10000);
  if (!page.ok) return { ok: false, error: page.error, state: "temporarily_unavailable" };
  const data = parseAllabolagHtml(page.body);
  const observations: ObservationInput[] = data.slice(0, 1).map((c) => ({
    field: "name",
    rawValue: c.name,
    normalisedValue: c.name,
    confidence: 74,
    sourceReliability: reliability("bolagsverket"),
    extractionMethod: "allabolag_html",
    sourceUrl: url,
    licence: "Allabolag public HTML. Bolagsverket has no bulk open API.",
    verificationStatus: "published",
  }));
  return { ok: true, data, observations, sourceUrl: url };
}

export async function mailboxFromDomain(domain: string): Promise<AdapterResult<ContactHit[]>> {
  const host = normalizeDomain(domain);
  if (!host) return { ok: false, error: "No domain" };
  const paths = ["", "/yhteystiedot", "/contact", "/contact-us", "/ota-yhteytta", "/about"];
  const hits: ContactHit[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const url = `https://${host}${path}`;
    const page = await fetchHtml(url, 8000);
    if (!page.ok) continue;
    for (const email of extractEmails(page.body)) {
      const v = email.value.toLowerCase();
      if (seen.has(v) || isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) continue;
      seen.add(v);
      hits.push({
        kind: "email",
        value: v,
        classification: email.classification === "obfuscated" ? "obfuscated" : "published",
        evidence: `Published on ${url}`,
        sourceUrl: url,
        sourceId: "hunter",
        confidence: email.classification === "obfuscated" ? 70 : 78,
        derivationMethod: "norf_public_page",
      });
    }
    if (hits.length >= 8) break;
  }
  return { ok: true, data: hits, observations: [], sourceUrl: `https://${host}` };
}

export async function publicWebSearch(query: string): Promise<AdapterResult<{ title: string; url: string }[]>> {
  const r = await duckDuckGoHtmlSearch(query, 8000);
  const data = r.hits
    .filter((h) => h.url && h.title)
    .slice(0, 8)
    .map((h) => ({ title: h.title, url: h.url }));
  return { ok: true, data, observations: [], sourceUrl: "https://html.duckduckgo.com/html/" };
}

export async function publishedAccountsLookup(opts: { name: string; businessId?: string | null }): Promise<AdapterResult<{
  revenue: number | null;
  profit: number | null;
  evidence: string[];
  sourceUrl: string | null;
}>> {
  const kl = await kauppalehtiLookup({ name: opts.name, businessId: opts.businessId });
  const nd = await northdataLookup({ name: opts.name, businessId: opts.businessId });
  const blobs: string[] = [];
  let sourceUrl: string | null = kl.sourceUrl || nd.sourceUrl || null;
  if (kl.profile) blobs.push(JSON.stringify(kl.profile));
  for (const o of [...(kl.observations ?? []), ...(nd.observations ?? [])]) {
    if (o.evidence) blobs.push(String(o.evidence));
    if (o.rawValue) blobs.push(String(o.rawValue));
  }
  const fin = extractFinancialMentions(blobs.join("\n"));
  const observations: ObservationInput[] = [];
  if (fin.revenue != null) {
    observations.push({
      field: "revenue",
      rawValue: String(fin.revenue),
      normalisedValue: String(fin.revenue),
      confidence: 72,
      sourceReliability: reliability("asiakastieto"),
      extractionMethod: "published_accounts_html",
      sourceUrl: sourceUrl ?? undefined,
      licence: "Public Kauppalehti / North Data cards. No Asiakastieto contract.",
      verificationStatus: "published",
      evidence: fin.evidence[0] ?? "Published figure on a public company card",
    });
  }
  return {
    ok: true,
    data: { revenue: fin.revenue, profit: fin.profit, evidence: fin.evidence, sourceUrl },
    observations,
    sourceUrl: sourceUrl ?? undefined,
  };
}

export async function businessFinlandFunding(name: string): Promise<AdapterResult<Array<{ title: string; url: string }>>> {
  const q = name.trim();
  if (q.length < 3) return { ok: false, error: "Query too short" };
  const ddg = await duckDuckGoHtmlSearch(`site:businessfinland.fi ${q} rahoitus`, 8000);
  const hits = ddg.hits.filter((h) => /businessfinland\.fi/i.test(h.url)).slice(0, 6);
  const observations: ObservationInput[] = hits.slice(0, 1).map((h) => ({
    field: "funding",
    rawValue: h.title,
    normalisedValue: h.title,
    confidence: 60,
    sourceReliability: reliability("business_finland"),
    extractionMethod: "business_finland_public",
    sourceUrl: h.url,
    licence: "Business Finland public pages",
    verificationStatus: "published",
    evidence: h.snippet?.slice(0, 160) ?? h.title,
  }));
  return {
    ok: true,
    data: hits.map((h) => ({ title: h.title, url: h.url })),
    observations,
    sourceUrl: "https://www.businessfinland.fi/",
  };
}

export async function statfinPing(): Promise<AdapterResult<{ tables: number }>> {
  const url = "https://statfin.stat.fi/PXWeb/api/v1/fi/StatFin/";
  const r = await getJson<unknown>(url, { timeoutMs: 10000 });
  if (!r.ok) return { ok: false, error: r.error, state: "temporarily_unavailable" };
  const n = Array.isArray(r.data) ? r.data.length : 1;
  return { ok: true, data: { tables: n }, observations: [], sourceUrl: url };
}

export async function ejusticePortal(country: string, name?: string, businessId?: string): Promise<AdapterResult<{ url: string; register: string }>> {
  const portal = registerPortalFor(country, name, businessId);
  return { ok: true, data: portal, observations: [], sourceUrl: portal.url };
}

export async function commonCrawlLatestIndex(): Promise<string | null> {
  const r = await getJson<Array<{ id?: string; "cdx-api"?: string }>>("https://index.commoncrawl.org/collinfo.json", { timeoutMs: 10000 });
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]?.id) return null;
  return r.data[0].id ?? null;
}

export async function commonCrawlLookup(host: string): Promise<AdapterResult<{ snapshot: string | null; index: string | null }>> {
  const domain = normalizeDomain(host);
  if (!domain) return { ok: false, error: "No domain" };
  const index = await commonCrawlLatestIndex();
  if (!index) return { ok: false, error: "Common Crawl index unavailable", state: "temporarily_unavailable" };
  const url = `https://index.commoncrawl.org/${encodeURIComponent(index)}-index?url=${encodeURIComponent(domain)}/*&output=json&limit=3`;
  const page = await fetchHtml(url, 12000);
  if (!page.ok) return { ok: false, error: page.error, state: "temporarily_unavailable" };
  let snapshot: string | null = null;
  for (const line of page.body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const row = JSON.parse(t) as { url?: string; filename?: string };
      if (row.url && /^https?:/i.test(row.url)) {
        snapshot = row.url;
        break;
      }
    } catch {
      /* next line */
    }
  }
  return { ok: true, data: { snapshot, index }, observations: [], sourceUrl: url };
}

export function decodeOcHref(href: string): string {
  return decodeHref(href);
}

const XBRL_REV = /(?:revenue|liikevaihto|turnover|netSales|netsales)/i;
const XBRL_PROFIT = /(?:operatingProfit|operatingprofit|liikevoitto|profitLoss|profitloss|netProfit)/i;
const XBRL_EQUITY = /(?:^|:)(?:equity|oma pääoma|shareholdersEquity|equityattributable)/i;
const XBRL_ASSETS = /(?:^|:)(?:assets|totalassets|taseen loppusumma|balanceSheetTotal)/i;
const XBRL_LIAB = /(?:^|:)(?:liabilities|vieras pääoma|totalliabilities)/i;

export type XbrlFacts = {
  revenue: number | null;
  profit: number | null;
  year: string | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  equityRatio: number | null;
};

export function parseXbrlFacts(raw: string): XbrlFacts {
  let revenue: number | null = null;
  let profit: number | null = null;
  let year: string | null = null;
  let equity: number | null = null;
  let assets: number | null = null;
  let liabilities: number | null = null;
  const takeNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const consider = (name: string, val: number) => {
    if (XBRL_REV.test(name) && (revenue == null || Math.abs(val) > Math.abs(revenue))) revenue = val;
    if (XBRL_PROFIT.test(name) && profit == null) profit = val;
    if (XBRL_EQUITY.test(name) && equity == null) equity = val;
    if (XBRL_ASSETS.test(name) && assets == null) assets = val;
    if (XBRL_LIAB.test(name) && liabilities == null) liabilities = val;
  };
  try {
    const parsed = JSON.parse(raw) as unknown;
    let rows: unknown[] = [];
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      if (Array.isArray(rec.financials)) rows = rec.financials as unknown[];
      else if (Array.isArray(rec.facts)) rows = rec.facts as unknown[];
      else if (Array.isArray(rec.data)) rows = rec.data as unknown[];
      else rows = [parsed];
    }
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name ?? rec.concept ?? rec.element ?? "");
      const val = takeNum(rec.value ?? rec.amount ?? rec.periodAmount);
      const end = String(rec.endDate ?? rec.periodEnd ?? rec.year ?? rec.period ?? "");
      if (end.match(/20\d{2}/) && !year) year = end.match(/20\d{2}/)?.[0] ?? null;
      if (val == null) continue;
      consider(name, val);
    }
  } catch {
    const yearHit = raw.match(/contextRef="[^"]*(20\d{2})[^"]*"/i) ?? raw.match(/>(20\d{2})</);
    if (yearHit) year = yearHit[1] ?? null;
    const facts = raw.matchAll(/name="([^"]+)"[^>]*>([-+]?\d[\d\s.,]*)<\/(?:ix:nonFraction|xbrli:nonFraction|nonFraction)/gi);
    for (const m of facts) {
      const n = takeNum(m[2]);
      if (n == null) continue;
      consider(m[1] ?? "", n);
    }
  }
  if (revenue != null && (revenue < 1000 || revenue > 50_000_000_000)) revenue = null;
  if (profit != null && Math.abs(profit) > 10_000_000_000) profit = null;
  if (equity != null && Math.abs(equity) > 50_000_000_000) equity = null;
  if (assets != null && (assets < 1000 || assets > 50_000_000_000)) assets = null;
  const equityRatio = equity != null && assets != null && assets > 0 ? Math.round((equity / assets) * 1000) / 1000 : null;
  return { revenue, profit, year, equity, assets, liabilities, equityRatio };
}

export async function prhXbrlLookup(businessId: string): Promise<AdapterResult<{
  revenue: number | null;
  profit: number | null;
  year: string | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  equityRatio: number | null;
  previousRevenue: number | null;
  previousYear: string | null;
  status: "VERIFIED" | "UNAVAILABLE";
  emptyReason?: "source_failed" | "no_filing" | "parser_empty";
  periodsListed: number;
}>> {
  const bid = normalizeBusinessId(businessId);
  if (!bid) return { ok: false, error: "No business ID" };
  const key = cacheKey("financial_period", ["prh", bid]);
  const cached = readCache<Awaited<ReturnType<typeof prhXbrlLookup>>>(key);
  if (cached && !cached.failed) return cached.value;

  const listUrl = `https://avoindata.prh.fi/opendata-xbrl-api/v3/financials?businessId=${encodeURIComponent(bid)}`;
  const r = await getJson<{ totalResults?: number; financials?: Array<{ businessId?: string; financialDate?: string }> }>(listUrl, { timeoutMs: 10000 });
  if (!r.ok) {
    const fail = { ok: false as const, error: r.error, state: r.status === 429 ? "rate_limited" as const : "temporarily_unavailable" as const };
    writeCache({ key, kind: "source_failed", value: fail, failed: true });
    return fail;
  }
  const periods = [...(r.data.financials ?? [])]
    .map((p) => p.financialDate)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => b.localeCompare(a));
  const emptyBase = {
    revenue: null, profit: null, year: null, equity: null, assets: null, liabilities: null, equityRatio: null,
    previousRevenue: null, previousYear: null, status: "UNAVAILABLE" as const, periodsListed: periods.length,
  };

  if (!periods.length) {
    const emptyReason = financialEmptyReason({ httpOk: true, periodsListed: 0, factsParsed: false });
    const observations: ObservationInput[] = [{
      field: "xbrl",
      rawValue: "unavailable",
      normalisedValue: "unavailable",
      confidence: 20,
      sourceReliability: reliability("prh_xbrl"),
      extractionMethod: "prh_xbrl_v3",
      sourceUrl: listUrl,
      licence: "PRH XBRL open data, CC BY 4.0",
      verificationStatus: "not_found",
      evidence: "PRH XBRL listed no digital financial periods for this business ID",
    }];
    const result = { ok: true as const, data: { ...emptyBase, emptyReason }, observations, sourceUrl: listUrl };
    writeCache({ key, kind: "financial_absent", value: result, absent: true });
    return result;
  }

  const latestDate = periods[0]!;
  const prevDate = periods[1] ?? null;
  const xmlUrl = `https://avoindata.prh.fi/opendata-xbrl-api/v3/financial?businessId=${encodeURIComponent(bid)}&financialDate=${encodeURIComponent(latestDate)}`;
  const xml = await fetchHtml(xmlUrl, 15000);
  let facts = parseXbrlFacts(xml.ok ? xml.body : "");
  if (!facts.year) facts = { ...facts, year: latestDate.slice(0, 4) };
  let previousRevenue: number | null = null;
  let previousYear: string | null = null;
  if (prevDate) {
    const prevUrl = `https://avoindata.prh.fi/opendata-xbrl-api/v3/financial?businessId=${encodeURIComponent(bid)}&financialDate=${encodeURIComponent(prevDate)}`;
    const prevXml = await fetchHtml(prevUrl, 12000);
    if (prevXml.ok) {
      const prev = parseXbrlFacts(prevXml.body);
      previousRevenue = prev.revenue;
      previousYear = prev.year ?? prevDate.slice(0, 4);
    }
  }
  const verified = facts.revenue != null || facts.profit != null || facts.equity != null;
  const emptyReason = verified ? undefined : financialEmptyReason({ httpOk: xml.ok, periodsListed: periods.length, factsParsed: verified });
  const observations: ObservationInput[] = [{
    field: "xbrl",
    rawValue: verified ? JSON.stringify({ ...facts, previousRevenue }) : "unavailable",
    normalisedValue: verified ? String(facts.revenue ?? facts.profit ?? facts.equity) : "unavailable",
    confidence: verified ? 88 : 20,
    sourceReliability: reliability("prh_xbrl"),
    extractionMethod: "prh_xbrl_v3",
    sourceUrl: xmlUrl,
    licence: "PRH XBRL open data, CC BY 4.0",
    verificationStatus: verified ? "verified" : "not_found",
    evidence: verified
      ? `PRH iXBRL ${facts.year ?? latestDate}`
      : `PRH listed ${periods.length} period(s) but facts could not be parsed`,
  }];
  if (verified && facts.revenue != null) {
    observations.push({
      field: "revenue",
      rawValue: String(facts.revenue),
      normalisedValue: String(facts.revenue),
      confidence: 90,
      sourceReliability: reliability("prh_xbrl"),
      extractionMethod: "prh_xbrl_v3",
      sourceUrl: xmlUrl,
      licence: "PRH XBRL open data, CC BY 4.0",
      verificationStatus: "verified",
      evidence: `PRH iXBRL revenue ${facts.year ?? ""}`.trim(),
    });
  }
  const result = {
    ok: true as const,
    data: {
      ...facts,
      previousRevenue,
      previousYear,
      status: verified ? "VERIFIED" as const : "UNAVAILABLE" as const,
      emptyReason,
      periodsListed: periods.length,
    },
    observations,
    sourceUrl: xmlUrl,
  };
  writeCache({ key, kind: verified ? "financial_period" : "financial_absent", value: result, absent: !verified });
  return result;
}

function hiringBoard(url: string): string {
  if (/duunitori\.fi/i.test(url)) return "duunitori";
  if (/tyomarkkinatori\.fi|työmarkkinatori/i.test(url)) return "tyomarkkinatori";
  if (/jobly\.fi/i.test(url)) return "jobly";
  return "public_jobs";
}

export type PublicJobHit = {
  title: string;
  url: string;
  board: string;
  category: HiringCategory;
  postedAt: string | null;
  freshness: HiringFreshness;
};

function parseSnippetDate(snippet: string | null | undefined): string | null {
  if (!snippet) return null;
  const iso = snippet.match(/(20\d{2}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const fi = snippet.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
  if (fi) return `${fi[3]}-${fi[2]!.padStart(2, "0")}-${fi[1]!.padStart(2, "0")}`;
  return null;
}

export async function publicHiringSearch(opts: {
  name: string;
  municipality?: string | null;
  businessId?: string | null;
}): Promise<AdapterResult<PublicJobHit[]>> {
  const q = opts.name.trim();
  if (q.length < 3) return { ok: false, error: "Query too short" };
  const quoted = `"${q.replace(/"/g, "")}"`;
  const loc = opts.municipality?.trim() ? ` ${opts.municipality.trim()}` : "";
  const queries = [
    `site:duunitori.fi ${quoted}${loc}`,
    `site:tyomarkkinatori.fi ${quoted}`,
  ];
  const seen = new Set<string>();
  const hits: PublicJobHit[] = [];
  const pages = await Promise.all(queries.map((query) => duckDuckGoHtmlSearch(query, 8000)));
  const failedPages = pages.filter((p) => p.failed);
  const okPages = pages.filter((p) => !p.failed);
  if (!okPages.length) {
    return { ok: false, error: failedPages[0]?.error ?? "Job-board search blocked or unavailable" };
  }
  for (const ddg of okPages) {
    for (const h of ddg.hits) {
      if (!h.url || seen.has(h.url)) continue;
      if (!/duunitori\.fi|tyomarkkinatori\.fi|jobly\.fi/i.test(h.url)) continue;
      const blob = `${h.title} ${h.snippet ?? ""} ${h.url}`.toLowerCase();
      const core = coreCompanyName(q).toLowerCase();
      if (core.length >= 4 && !blob.includes(core)) continue;
      seen.add(h.url);
      const postedAt = parseSnippetDate(h.snippet);
      hits.push({
        title: h.title || q,
        url: h.url,
        board: hiringBoard(h.url),
        category: classifyHiringCategory(h.title),
        postedAt,
        freshness: hiringFreshness(postedAt),
      });
      if (hits.length >= 6) break;
    }
    if (hits.length >= 6) break;
  }
  const observations: ObservationInput[] = hits.slice(0, 1).map((h) => ({
    field: "hiring",
    rawValue: h.title,
    normalisedValue: "active",
    confidence: 70,
    sourceReliability: reliability("duunitori"),
    extractionMethod: "public_job_board_search",
    sourceUrl: h.url,
    licence: "Public job-board search snippets. Not a Duunitori API contract.",
    verificationStatus: "published",
    evidence: `${h.board} public listing mentioning ${q}`,
  }));
  return {
    ok: true,
    data: hits,
    observations,
    sourceUrl: hits[0]?.url,
  };
}

