/**
 * Homemade public-web search. Parses HTML from open search engines.
 * Google is attempted (gbv=1) and recorded UNAVAILABLE on consent/captcha.
 * Hits are never invented: empty HTML returns an empty list.
 */
import type { ContactHit, PersonHit } from "../types.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { decodeHref, extractPeopleFromText, stripTags } from "../extract.ts";
import { extractEmails, extractPhones, isJunkEmail } from "../contacts.ts";
import { normalizeWebsite } from "../normalize.ts";
import { duckDuckGoHtmlSearch, isDirectoryHost, pickCompanyUrl, scoreWebsiteCandidate } from "./webdiscover.ts";
import { expandSearchQueries } from "./queries.ts";
import { RUNTIME } from "../runtime.ts";

export type SearchHit = { url: string; title: string; snippet: string; engine: string };

const ENGINE_HOST = /(?:google|bing|brave|startpage|duckduckgo|yahoo|yimg|microsoft|msn|bingj)\./i;

function unwrapRedirect(href: string): string {
  const decoded = decodeHref(href);
  try {
    const u = new URL(decoded, "https://example.invalid");
    for (const key of ["q", "uddg", "u", "url"]) {
      const v = u.searchParams.get(key);
      if (v && /^https?:\/\//i.test(v)) return v;
    }
    if (/^https?:\/\//i.test(decoded)) return decoded;
  } catch {
    /* keep */
  }
  return decoded;
}

function pushHit(out: SearchHit[], seen: Set<string>, raw: string, title: string, snippet: string, engine: string) {
  const url = normalizeWebsite(unwrapRedirect(raw));
  if (!url || seen.has(url)) return;
  try {
    const host = new URL(url).hostname;
    if (ENGINE_HOST.test(host) || isDirectoryHost(url) && /google|bing|brave|startpage|yahoo/i.test(host)) {
      if (ENGINE_HOST.test(host)) return;
    }
  } catch {
    return;
  }
  if (ENGINE_HOST.test(url)) return;
  seen.add(url);
  out.push({ url, title: stripTags(title).replace(/\s+/g, " ").trim().slice(0, 180), snippet: stripTags(snippet).replace(/\s+/g, " ").trim().slice(0, 280), engine });
}

export function parseGoogleHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const re = /href="(\/url\?q=[^"]+|https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1] ?? "";
    if (/google\.(?:com|fi|co)|accounts\.google|policies\.google|support\.google/i.test(href)) continue;
    pushHit(out, seen, href, m[2] ?? "", "", "google");
    if (out.length >= 16) break;
  }
  return out;
}

export function parseBingHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const block = /<li[^>]*class="[^"]*b_algo[^"]*"[\s\S]*?<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = block.exec(html))) {
    const chunk = m[0] ?? "";
    const a = chunk.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const snip = chunk.match(/<(?:p|div)[^>]*class="[^"]*(?:b_lineclamp|b_caption)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i)?.[1] ?? "";
    pushHit(out, seen, a[1] ?? "", a[2] ?? "", snip, "bing");
    if (out.length >= 16) break;
  }
  if (!out.length) {
    const loose = /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = loose.exec(html))) {
      pushHit(out, seen, m[1] ?? "", m[2] ?? "", "", "bing");
      if (out.length >= 16) break;
    }
  }
  return out;
}

export function parseBraveHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const re = /<a\b([^>]*heading-serpresult[^>]*|[^>]*result-header[^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = /href="(https?:\/\/[^"]+)"/i.exec(m[1] ?? "")?.[1];
    if (!href) continue;
    pushHit(out, seen, href, m[2] ?? "", "", "brave");
    if (out.length >= 16) break;
  }
  if (!out.length) {
    const loose = /data-type="web"[\s\S]{0,400}?href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = loose.exec(html))) {
      pushHit(out, seen, m[1] ?? "", m[2] ?? "", "", "brave");
      if (out.length >= 16) break;
    }
  }
  return out;
}

export function parseStartpageHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const re = /class="[^"]*w-gl__result[^"]*"[\s\S]{0,800}?href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    pushHit(out, seen, m[1] ?? "", m[2] ?? "", "", "startpage");
    if (out.length >= 16) break;
  }
  return out;
}

export function parseYahooHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const re = /<h3[^>]*class="[^"]*title[^"]*"[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    pushHit(out, seen, m[1] ?? "", m[2] ?? "", "", "yahoo");
    if (out.length >= 16) break;
  }
  return out;
}

async function fetchEngine(url: string, parse: (html: string) => SearchHit[], timeoutMs: number): Promise<SearchHit[]> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 700_000,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fi-FI,fi,en;q=0.8",
      },
    });
    if (res.status >= 400 || res.body.length < 200) return [];
    if (/captcha|unusual traffic|consent\.google|enable js/i.test(res.body) && res.body.length < 8000) return [];
    return parse(res.body);
  } catch {
    return [];
  }
}

export async function webSearch(query: string): Promise<{
  hits: SearchHit[];
  engines: string[];
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
}> {
  const q = query.trim();
  if (q.length < 2) return { hits: [], engines: [], emails: [], phones: [], people: [] };
  const enc = encodeURIComponent(q);
  const [ddg, bing, brave, google] = await Promise.all([
    duckDuckGoHtmlSearch(q, RUNTIME.webSearchTimeoutMs),
    fetchEngine(`https://www.bing.com/search?q=${enc}&setlang=fi`, parseBingHtml, RUNTIME.webSearchTimeoutMs),
    fetchEngine(`https://search.brave.com/search?q=${enc}&source=web`, parseBraveHtml, RUNTIME.webSearchTimeoutMs),
    fetchEngine(`https://www.google.com/search?q=${enc}&hl=fi&num=10&gbv=1&filter=0`, parseGoogleHtml, RUNTIME.googleSearchTimeoutMs),
  ]);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const engines: string[] = [];
  const take = (rows: SearchHit[], engine: string) => {
    if (rows.length) engines.push(engine);
    for (const h of rows) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push({ ...h, engine: h.engine || engine });
    }
  };
  take(ddg.hits.map((h) => ({ ...h, engine: "duckduckgo" })), "duckduckgo");
  take(bing, "bing");
  take(brave, "brave");
  take(google, "google");
  return {
    hits: hits.slice(0, 40),
    engines,
    emails: ddg.emails,
    phones: ddg.phones,
    people: ddg.people,
  };
}

export function extraUrlsOnHost(hits: SearchHit[], website: string): string[] {
  let host = "";
  try {
    host = new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    try {
      const u = new URL(h.url);
      if (u.hostname.replace(/^www\./, "").toLowerCase() !== host) continue;
      if (seen.has(u.pathname)) continue;
      seen.add(u.pathname);
      if (/yhteystiedot|contact|kontakt|johto|hallitus|meista|about|team|ura|career|job|tyopaikat|palvelut|services/i.test(`${u.pathname} ${h.title}`)) {
        out.push(u.toString());
      }
    } catch {
      /* skip */
    }
  }
  return out.slice(0, RUNTIME.extraCrawlCap);
}

export async function findCompanyPages(opts: {
  name: string;
  municipality?: string | null;
  businessId?: string | null;
  country?: string | null;
}): Promise<{
  website: string | null;
  hits: SearchHit[];
  engines: string[];
  extraUrls: string[];
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
}> {
  const queries = expandSearchQueries({
    name: opts.name,
    country: opts.country ?? "FI",
    municipality: opts.municipality,
    businessId: opts.businessId,
    depth: "deep",
  }).slice(0, RUNTIME.findCompanyQueryCap);
  const pages = await Promise.all(queries.map((q) => webSearch(q)));
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const engines = new Set<string>();
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const people: PersonHit[] = [];
  for (const p of pages) {
    for (const e of p.engines) engines.add(e);
    emails.push(...p.emails);
    phones.push(...p.phones);
    people.push(...p.people);
    for (const h of p.hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      hits.push(h);
    }
  }
  const picked = pickCompanyUrl(hits, opts.name);
  const website = picked?.url ?? hits
    .map((h) => ({ h, score: scoreWebsiteCandidate(h.url, opts.name, h.title, h.snippet) }))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)[0]?.h.url ?? null;
  return {
    website: website && !isDirectoryHost(website) ? website : null,
    hits,
    engines: [...engines],
    extraUrls: website ? extraUrlsOnHost(hits, website) : [],
    emails,
    phones,
    people,
  };
}

export function contactsFromHits(hits: SearchHit[], sourceUrl: string): {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
} {
  const blob = hits.map((h) => `${h.title} ${h.snippet}`).join(" \n ");
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  for (const e of extractEmails(blob)) {
    if (isJunkEmail(e.value) || isDirectoryHost(e.value.split("@")[1] ?? "")) continue;
    emails.push({
      kind: "email",
      value: e.value,
      classification: "published",
      sourceUrl,
      sourceId: "search_api",
      evidence: "Public web search snippet",
      confidence: 56,
    });
  }
  for (const p of extractPhones(blob, "FI")) {
    phones.push({
      kind: "phone",
      value: p,
      classification: "published",
      sourceUrl,
      sourceId: "search_api",
      evidence: "Public web search snippet",
      confidence: 54,
    });
  }
  const people = extractPeopleFromText(blob, sourceUrl, ["ceo", "chair", "cfo", "sales_director", "owner"]).map((p) => ({
    fullName: p.fullName,
    title: p.title,
    seniority: p.seniority,
    sourcePage: sourceUrl,
    evidence: p.evidence ?? "Public web search snippet",
    confidence: Math.min(p.confidence, 58),
    workEmail: p.workEmail ?? null,
    workPhone: p.workPhone ?? null,
  }));
  return { emails, phones, people };
}
