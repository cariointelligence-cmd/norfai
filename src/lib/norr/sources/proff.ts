/**
 * Proff.fi (Enento / Asiakastieto public HTML) and Asiakastieto company-card URLs.
 * robots.txt: first-page name/industry search is allowed. /segmentointi?* and paginated
 * query strings are not fetched. Y-tunnus is extracted, then YTJ hydrates official fields.
 */
import type { DiscoveredCompany } from "../types.ts";
import { normalizeBusinessId, normalizeName } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { duckDuckGoHtmlSearch } from "./webdiscover.ts";
import { bidFromSnippet, businessIdFromDigits, looksLikeCompanyName } from "./register-gate.ts";

export const PROFF_ORIGIN = "https://www.proff.fi";
export const PROFF_PARSER_VERSION = "1";
export const ASIAKASTIETO_PARSER_VERSION = "1";

export function proffPathAllowed(pathAndQuery: string): boolean {
  let path = pathAndQuery;
  let qs = "";
  try {
    const u = pathAndQuery.startsWith("http") ? new URL(pathAndQuery) : new URL(pathAndQuery, PROFF_ORIGIN);
    path = u.pathname;
    qs = u.search.slice(1);
  } catch {
    const cut = pathAndQuery.split("?");
    path = cut[0] ?? pathAndQuery;
    qs = cut[1] ?? "";
  }
  const q = new URLSearchParams(qs);
  if (path.startsWith("/segmentointi")) return false;
  if (path.startsWith("/api/")) return false;
  if (path.startsWith("/payment")) return false;
  if (path.startsWith("/company-compare")) return false;
  if (path.startsWith("/toimialahaku")) {
    return !q.has("spage") && !q.has("bppage") && !q.has("nspage");
  }
  if (path.startsWith("/yrityksen-nimi-haku") || path.startsWith("/yrityshaku")) {
    return !q.has("page") && !q.has("bppage") && !q.has("spage");
  }
  return true;
}

export function bidFromProffUrl(url: string): string | null {
  const hyphen = /(?:proff\.fi\/|\/)(?:yritys\/)?[^/?#]*\/(?:[^/?#]+\/)?(\d{7}-\d)(?:[/?#]|$)/i.exec(url);
  if (hyphen) return normalizeBusinessId(hyphen[1]);
  const digits = /(?:proff\.fi\/|\/)(?:yritys\/)?[^/?#]*\/(?:[^/?#]+\/)?(\d{7,8})(?:[/?#]|$)/i.exec(url);
  return digits ? businessIdFromDigits(digits[1]) : null;
}

export function bidFromAsiakastietoUrl(url: string): string | null {
  const m = /asiakastieto\.fi\/yritykset\/(?:fi\/)?[^/]+\/(\d{7,8})(?:[/?#]|$)/i.exec(url);
  return m ? businessIdFromDigits(m[1]) : null;
}

export function parseProffSearchHtml(html: string): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const push = (name: string, bid: string | null, municipality?: string | null) => {
    const cleaned = name.replace(/\s+/g, " ").trim();
    if (!cleaned || cleaned.length < 2) return;
    if (/asiakastieto|proff|kirjaudu|segmentointi|tietosuoja/i.test(cleaned)) return;
    const key = bid || normalizeName(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: cleaned, businessId: bid, country: "FI", municipality: municipality ?? null, website: null });
  };

  const card = /(?:<(?:h[1-6]|a)[^>]*>)\s*([^<]{2,140})\s*<\/(?:h[1-6]|a)>[\s\S]{0,500}?Y-tunnus\s*(\d{7}-\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = card.exec(html))) {
    const mun = /(?:\d{5})\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö-]+)/.exec(m[0] ?? "");
    push(m[1] ?? "", normalizeBusinessId(m[2] ?? ""), mun?.[1] ?? null);
    if (out.length >= 16) return out;
  }

  const href = /href="(\/[^"]*(?:\d{7}-\d|\d{7,8})[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = href.exec(html))) {
    const url = m[1] ?? "";
    const bid = bidFromProffUrl(url) ?? bidFromSnippet(url);
    const name = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (bid || name) push(name, bid);
    if (out.length >= 16) return out;
  }

  if (!out.length) {
    const loose = /Y-tunnus\s+(\d{7}-\d)/gi;
    while ((m = loose.exec(html))) {
      const around = html.slice(Math.max(0, (m.index ?? 0) - 180), (m.index ?? 0));
      const name = around.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(/\s{2,}/).pop() ?? "";
      push(name.replace(/^[^A-ZÅÄÖA-Za-z]+/, "").slice(-80), normalizeBusinessId(m[1] ?? ""));
      if (out.length >= 16) break;
    }
  }
  return out;
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string> {
  if (!proffPathAllowed(url)) return "";
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 800_000,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
      },
    });
    if (res.status >= 400) return "";
    return res.body;
  } catch {
    return "";
  }
}

function pushUnique(out: DiscoveredCompany[], seen: Set<string>, row: DiscoveredCompany) {
  const key = row.businessId || normalizeName(row.name);
  if (!key || seen.has(key) || row.name.length < 2) return;
  seen.add(key);
  out.push(row);
}

export async function proffDiscover(query: string, max: number): Promise<DiscoveredCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const ddg = await duckDuckGoHtmlSearch(`site:proff.fi ${q} Y-tunnus`, 5000).catch(() => ({
    hits: [] as Array<{ url: string; title: string; snippet: string }>,
  }));
  for (const hit of ddg.hits) {
    if (!/proff\.fi/i.test(hit.url)) continue;
    const bid = bidFromProffUrl(hit.url) ?? bidFromSnippet(`${hit.title} ${hit.snippet}`);
    const name = hit.title.replace(/\s*[|/].*$/, "").replace(/\s+/g, " ").trim();
    if (name) pushUnique(out, seen, { name, businessId: bid, country: "FI", website: null });
    if (out.length >= max) return out;
  }

  const path = looksLikeCompanyName(q)
    ? `${PROFF_ORIGIN}/yrityksen-nimi-haku?q=${encodeURIComponent(q)}`
    : `${PROFF_ORIGIN}/toimialahaku?q=${encodeURIComponent(q)}`;
  if (proffPathAllowed(path) && out.length < max) {
    const html = await fetchHtml(path, 7000);
    if (html) for (const row of parseProffSearchHtml(html)) pushUnique(out, seen, row);
  }
  return out.slice(0, max);
}

export async function asiakastietoDiscover(query: string, max: number): Promise<DiscoveredCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const ddg = await duckDuckGoHtmlSearch(`site:asiakastieto.fi/yritykset ${q}`, 5000).catch(() => ({
    hits: [] as Array<{ url: string; title: string; snippet: string }>,
  }));
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const hit of ddg.hits) {
    if (!/asiakastieto\.fi\/yritykset/i.test(hit.url)) continue;
    const bid = bidFromAsiakastietoUrl(hit.url) ?? bidFromSnippet(`${hit.title} ${hit.snippet}`);
    const name = hit.title
      .replace(/\s*[|/].*$/, "")
      .replace(/\s*[-–].*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || /asiakastieto|kirjaudu|tilaa/i.test(name)) continue;
    pushUnique(out, seen, { name, businessId: bid, country: "FI", website: null });
    if (out.length >= max) break;
  }
  return out;
}
