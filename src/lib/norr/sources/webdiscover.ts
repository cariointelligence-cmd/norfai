/**
 * Public-web discovery helpers. Directory/CDN/tracker hosts are never a
 * company website. Search snippets are used to find URLs, not contacts.
 */
import dns from "node:dns/promises";
import type { ContactHit, ObservationInput, PersonHit } from "../types.ts";
import { getJson } from "../http.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { normalizeName, normalizePhone, normalizeWebsite, stripDiacritics, isJunkCompanyWebsite, canonicalCompanyWebsite } from "../normalize.ts";
import { extractJsonLd, extractMeta, extractPageContacts, extractPeopleFromText, extractPeopleFromHtml, isParkingPage, stripTags, looksLikeSpa, contactLinksFromHtml, cleanPersonName, detectTechnologies, decodeHref } from "../extract.ts";
import { countryTlds, expandSearchQueries } from "./queries.ts";
import { reliability } from "./catalog.ts";
import { extractEmails, extractPhones, isJunkEmail, isRoleAddress, websiteFromPublishedEmail } from "../contacts.ts";
import { readRobots, robotsAllows } from "../crawler.ts";
import { fetchRendered, playwrightAvailable } from "../browser.ts";
import { analyzeWebsite, type WebsiteIntel } from "../targeting/website.ts";
import { poolMap } from "../engines.ts";
import { RUNTIME } from "../runtime.ts";
import { pickFanOutUrls } from "../job-budget.ts";
import { contactPlan, contactHarvestDone } from "../contact-plan.ts";

const GENERIC_TOKENS = new Set([
  "rakennus", "rakennusliike", "rakennuttaminen", "korjausrakentaminen",
  "palvelu", "palvelut", "group", "holding", "finland", "suomi", "suomen",
  "kiinteisto", "asunto", "consulting", "konsultointi", "engineering",
  "solutions", "systems", "system", "tech", "digital", "media", "yhtio",
  "yhtyma", "company", "corp", "services", "service", "nordic",
  "international", "partners", "partner", "studio", "agency", "toimisto",
  "liike", "kone", "kauppa", "maalaus", "talotekniikka", "infra",
  "osakeyhtio", "aktiebolag", "and", "the", "oyj", "oy", "ab", "ky", "ry",
  "co", "ltd", "plc", "inc", "suunnittelu", "urakointi", "asennus",
  "association", "of", "land", "non", "residential", "buildings",
]);

const DIRECTORY_HOSTS = [
  "finder.fi", "fonecta.fi", "ytj.fi", "prh.fi", "kauppalehti.fi",
  "asiakastieto.fi", "profinder.fi", "allbiz.fi", "sttinfo.fi",
  "almatalent.fi", "almamedia.fi", "almainights.fi", "almainsights.fi", "taloussanomat.fi",
  "iltalehti.fi", "iltasanomat.fi", "aamulehti.fi", "talouselama.fi", "uusisuomi.fi",
  "tekniikkatalous.fi", "tivi.fi", "mikrobitti.fi", "mtvuutiset.fi", "mtv.fi",
  "wikipedia.org", "wikidata.org", "facebook.com", "linkedin.com",
  "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
  "crunchbase.com", "bloomberg.com", "reuters.com", "yelp.fi", "yelp.com",
  "merinfo.se", "proff.no", "proff.fi", "hitta.se", "eniro.se", "gulesider.no",
  "krak.dk", "cvr.dk", "opencorporates.com", "dnb.com", "zoominfo.com",
  "duckduckgo.com", "google.com", "bing.com", "yahoo.com",
  "bbc.co.uk", "bbc.com", "cnn.com", "forbes.com", "ft.com", "wsj.com",
  "nytimes.com", "theguardian.com", "yle.fi", "hs.fi", "is.fi",
  "kauppalehti.fi", "talouselama.fi", "endole.co.uk", "northdata.de", "northdata.com",
  "allabolag.se", "companycheck.co.uk", "020202.fi", "web.archive.org",
  "cloudfront.net", "akamaized.net", "akamaihd.net", "googleusercontent.com",
  "googleapis.com", "gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com",
  "fbcdn.net", "twimg.com", "imgix.net", "cloudinary.com", "wixstatic.com",
  "shopifycdn.com", "fastly.net",
  "vainu.com", "vainu.io", "leadfeeder.com", "dealfront.com",
  "ytunnus.fi", "yritystieto.fi", "bisnode.fi", "creditsafe.com",
  "jsdelivr.net", "unpkg.com", "typekit.net", "googletagmanager.com",
  "schema.org", "w3.org",
  "abtasty.com", "sentry.io", "mixpanel.com", "intercom.io", "intercom.com",
  "hubspot.com", "optimizely.com", "fullstory.com", "cookieyes.com", "clarity.ms", "vwo.com",
  "k5a.io", "zaraz.com", "cloudflareinsights.com",
];

export function isDirectoryHost(urlOrHost: string): boolean {
  let host = urlOrHost.toLowerCase();
  try {
    if (urlOrHost.includes("://") || urlOrHost.startsWith("//")) host = new URL(urlOrHost.startsWith("//") ? `https:${urlOrHost}` : urlOrHost).hostname;
  } catch {
    /* use raw */
  }
  host = host.replace(/^www\./, "");
  if (!host) return false;
  if (/^(assets|cdn|static|img|images|media|static-assets|fonts)\./.test(host)) return true;
  if (/\.(png|jpe?g|gif|webp|svg|avif|css|js|mjs|woff2?|ico)(\?|$)/i.test(urlOrHost)) return true;
  if (isJunkCompanyWebsite(urlOrHost.includes("://") ? urlOrHost : `https://${host}`)) return true;
  return DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

export function domainCandidates(name: string, country?: string | null): string[] {
  const n = normalizeName(name);
  const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const distinctive = tokens.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
  const bases = new Set<string>();
  if (distinctive[0] && distinctive[0].length >= 4) bases.add(distinctive[0]);
  if (distinctive[0] && distinctive[0].length >= 3 && distinctive.length <= 2) bases.add(distinctive[0]);
  if (distinctive.length >= 2) {
    bases.add(distinctive.slice(0, 2).join(""));
    bases.add(distinctive.slice(0, 2).join("-"));
  }
  const joined = distinctive.join("");
  if (joined.length >= 5 && joined.length <= 28) bases.add(joined);
  const tlds = countryTlds(country);
  const out: string[] = [];
  for (const base of bases) {
    for (const tld of tlds) out.push(`${base}${tld}`);
  }
  return out.slice(0, 12);
}

export type SearchHit = { url: string; title: string; snippet: string };

function unwrapDdg(href: string): string {
  const decoded = decodeHref(href);
  try {
    const u = new URL(decoded, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg") ?? u.searchParams.get("u");
    if (uddg && /^https?:\/\//i.test(uddg)) return uddg;
  } catch {
    /* keep */
  }
  return decoded;
}

export async function duckDuckGoHtmlSearch(query: string, timeoutMs = 6000): Promise<{ hits: SearchHit[]; failed?: boolean; error?: string }> {
  const q = query.trim();
  if (q.length < 2) return { hits: [] };
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 400_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8" },
    });
    if (res.status === 202 || res.status >= 400) return { hits: [], failed: true, error: `ddg_http_${res.status}` };
    const body = String(res.body ?? "");
    if (!/result__a|uddg=/i.test(body) && /anomaly|captcha|challenge|detected unusual/i.test(body)) {
      return { hits: [], failed: true, error: "ddg_challenge" };
    }
    return { hits: parseDdgHtml(body) };
  } catch {
    return { hits: [], failed: true, error: "ddg_network" };
  }
}

export function parseDdgHtml(html: string): SearchHit[] {
  const out: SearchHit[] = [];
  const seen = new Set<string>();
  const block = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = block.exec(html))) {
    const href = unwrapDdg(m[1] ?? "");
    const title = stripTags(m[2] ?? "").replace(/\s+/g, " ").trim();
    const snippetStart = html.slice(m.index, m.index + 1200);
    const snip = stripTags(snippetStart.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const url = normalizeWebsite(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: title.slice(0, 180), snippet: snip.slice(0, 280) });
    if (out.length >= 16) break;
  }
  if (!out.length) {
    const loose = /href="([^"]*uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = loose.exec(html))) {
      const url = normalizeWebsite(unwrapDdg(m[1] ?? ""));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: stripTags(m[2] ?? "").slice(0, 180), snippet: "" });
      if (out.length >= 16) break;
    }
  }
  return out;
}

export function pageMentionsCompany(blob: string, name: string, title?: string): boolean {
  const core = normalizeName(name);
  if (core.length < 3) return false;
  const hay = normalizeName(`${title ?? ""} ${blob}`);
  if (hay.includes(core)) return true;
  const tokens = core.split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
  if (!tokens.length) return false;
  return tokens.every((t) => hay.includes(t));
}

export function scoreWebsiteCandidate(url: string, name: string, title = "", snippet = ""): number {
  if (!url || isDirectoryHost(url) || isJunkCompanyWebsite(url)) return 0;
  let score = 1;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const core = normalizeName(name).replace(/\s+/g, "");
    const hostCore = host.split(".")[0] ?? "";
    if (core && hostCore && (hostCore.includes(core.slice(0, 8)) || core.includes(hostCore))) score += 5;
  } catch {
    return 0;
  }
  if (pageMentionsCompany(`${title} ${snippet}`, name, title)) score += 3;
  if (/yhteystiedot|contact|kontakt/i.test(url + title)) score += 1;
  return score;
}

export function pickCompanyUrl(hits: Array<{ url: string; title?: string; snippet?: string }>, name: string): { url: string; title: string } | null {
  const scored = hits
    .map((h) => ({ h, score: scoreWebsiteCandidate(h.url, name, h.title ?? "", h.snippet ?? "") }))
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score);
  const hit = scored[0]?.h;
  if (!hit) return null;
  return { url: hit.url, title: hit.title ?? "" };
}

function contactUrlsOnHost(hits: SearchHit[], website: string): string[] {
  let host = "";
  try { host = new URL(website).hostname.replace(/^www\./, "").toLowerCase(); } catch { return []; }
  const out: string[] = [];
  for (const h of hits) {
    try {
      const hh = new URL(h.url).hostname.replace(/^www\./, "").toLowerCase();
      if (hh !== host && !hh.endsWith(`.${host}`)) continue;
      if (/yhteystiedot|contact|kontakt|tiimi|team|johto|about|meista/i.test(h.url)) out.push(h.url);
    } catch { /* skip */ }
  }
  return out.slice(0, 8);
}

function mergeUniqueEmails(into: ContactHit[], add: ContactHit[]): void {
  const seen = new Set(into.map((e) => e.value.toLowerCase()));
  for (const e of add) {
    const v = e.value.toLowerCase();
    if (seen.has(v) || isJunkEmail(v)) continue;
    seen.add(v);
    into.push({ ...e, value: v });
  }
}

function mergeUniquePhones(into: ContactHit[], add: ContactHit[]): void {
  const seen = new Set(into.map((p) => p.value));
  for (const p of add) {
    const v = normalizePhone(p.value);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    into.push({ ...p, value: v });
  }
}

function mergeUniquePeople(into: PersonHit[], add: PersonHit[]): void {
  const seen = new Set(into.map((p) => normalizeName(p.fullName)));
  for (const p of add) {
    const n = normalizeName(p.fullName);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    into.push(p);
  }
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<{ ok: boolean; url: string; html: string; status: number }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 700_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8" },
    });
    return { ok: res.status < 400 && res.body.length > 80, url: res.url || url, html: res.body, status: res.status };
  } catch {
    return { ok: false, url, html: "", status: 0 };
  }
}

export async function probeDomain(domain: string, companyName: string): Promise<{
  website: string;
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  title?: string;
} | null> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").toLowerCase();
  if (!host || isDirectoryHost(host)) return null;
  try {
    await dns.lookup(host);
  } catch {
    return null;
  }
  const site = canonicalCompanyWebsite(`https://${host}`);
  if (!site) return null;
  const page = await fetchPage(site, 7000);
  if (!page.ok) return null;
  if (isParkingPage(page.html)) return null;
  const title = extractMeta(page.html).title ?? stripTags(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!pageMentionsCompany(`${title} ${stripTags(page.html).slice(0, 4000)}`, companyName, title)) return null;
  const contacts = extractPageContacts(page.html, page.url);
  const people = extractPeopleFromHtml(page.html, page.url);
  return {
    website: site,
    emails: (contacts.emails ?? []).map((e) => ({
      kind: "email" as const,
      value: e.value,
      classification: e.classification,
      sourceUrl: page.url,
      sourceId: "website",
      evidence: "Company home page",
      confidence: 70,
    })),
    phones: (contacts.phones ?? []).map((p) => ({
      kind: "phone" as const,
      value: normalizePhone(p.value) ?? "",
      classification: "published" as const,
      sourceUrl: page.url,
      sourceId: "website",
      evidence: "Company home page",
      confidence: 68,
    })).filter((p) => p.value),
    people,
    title,
  };
}

export async function harvestSite(opts: {
  website: string;
  companyName: string;
  extraUrls?: string[];
  requireName?: boolean;
  budget?: number;
  depth?: string | null;
  exhaustive?: boolean;
}): Promise<{
  website: string | null;
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  intel?: WebsiteIntel | null;
}> {
  const origin = canonicalCompanyWebsite(opts.website);
  if (!origin) return { website: null, emails: [], phones: [], people: [] };
  const budget = Math.max(2, Math.min(opts.budget ?? (opts.exhaustive ? 6 : 3), 8));
  if (opts.requireName || opts.exhaustive) return harvestSiteLive(origin, budget, opts);
  const { cacheCoalesce, cacheKey, CACHE_TTL } = await import("../intel-cache.ts");
  return cacheCoalesce(cacheKey(["harvest", origin, String(budget)]), CACHE_TTL.website, () => harvestSiteLive(origin, budget, opts));
}

async function harvestSiteLive(
  origin: string,
  budget: number,
  opts: {
    website: string;
    companyName: string;
    extraUrls?: string[];
    requireName?: boolean;
    budget?: number;
    depth?: string | null;
    exhaustive?: boolean;
  },
): Promise<{
  website: string | null;
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  intel?: WebsiteIntel | null;
}> {
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const people: PersonHit[] = [];
  let home = await fetchPage(origin, opts.depth === "deep" ? 6000 : 2200);
  if (!home.ok && opts.depth === "deep" && playwrightAvailable()) {
    const rendered = await fetchRendered(origin, { waitMs: 800, timeoutMs: 9000 });
    if (rendered.ok) home = { ok: true, url: rendered.url ?? origin, html: rendered.html, status: 200 };
  }
  if (!home.ok) return { website: origin, emails, phones, people };
  if (opts.requireName && !pageMentionsCompany(stripTags(home.html).slice(0, 6000), opts.companyName, extractMeta(home.html).title ?? "")) {
    return { website: null, emails, phones, people };
  }
  const seedContacts = extractPageContacts(home.html, home.url);
  mergeUniqueEmails(emails, (seedContacts.emails ?? []).map((e) => ({
    kind: "email" as const,
    value: e.value,
    classification: e.classification,
    sourceUrl: home.url,
    sourceId: "website",
    evidence: "Company homepage",
    confidence: 74,
  })));
  mergeUniquePhones(phones, (seedContacts.phones ?? []).map((p) => ({
    kind: "phone" as const,
    value: normalizePhone(p.value) ?? "",
    classification: "published" as const,
    sourceUrl: home.url,
    sourceId: "website",
    evidence: "Company homepage",
    confidence: 70,
  })).filter((p) => p.value));
  mergeUniquePeople(people, extractPeopleFromHtml(home.html, home.url));
  const namedEmails = emails.filter((e) => !isRoleAddress(e.value)).length;
  if (!opts.exhaustive && contactHarvestDone({ emails: emails.length, namedEmails, phones: phones.length, people: people.length, depth: opts.depth })) {
    let intel: WebsiteIntel | null = null;
    try { intel = analyzeWebsite({ html: home.html, url: home.url }); } catch { intel = null; }
    return { website: origin, emails, phones, people, intel };
  }
  const seed = new Set<string>([home.url, origin, ...(opts.extraUrls ?? [])]);
  for (const u of pickFanOutUrls({
    origin,
    already: seed,
    slots: Math.max(1, budget - 1),
    depth: opts.depth,
  })) seed.add(u);
  for (const extra of contactLinksFromHtml(home.html, origin).slice(0, 4)) seed.add(extra);
  const urls = [...seed].filter((u) => {
    try {
      const parsed = new URL(u);
      if (parsed.origin !== new URL(origin).origin) return false;
      const homeHostPath = new URL(home.url).pathname.replace(/\/$/, "") || "/";
      if ((parsed.pathname.replace(/\/$/, "") || "/") === homeHostPath) return false;
      return robotsAllows("", parsed.pathname);
    } catch { return false; }
  }).slice(0, budget);

  const pages = await poolMap(urls, 4, async (url) => fetchPage(url, 2200));
  for (const page of pages) {
    if (!page.ok) continue;
    const contacts = extractPageContacts(page.html, page.url);
    mergeUniqueEmails(emails, (contacts.emails ?? []).map((e) => ({
      kind: "email" as const,
      value: e.value,
      classification: e.classification,
      sourceUrl: page.url,
      sourceId: "website",
      evidence: "Company-controlled page",
      confidence: 72,
    })));
    mergeUniquePhones(phones, (contacts.phones ?? []).map((p) => ({
      kind: "phone" as const,
      value: normalizePhone(p.value) ?? "",
      classification: "published" as const,
      sourceUrl: page.url,
      sourceId: "website",
      evidence: "Company-controlled page",
      confidence: 70,
    })).filter((p) => p.value));
    mergeUniquePeople(people, extractPeopleFromHtml(page.html, page.url));
    mergeUniquePeople(people, extractPeopleFromText(stripTags(page.html).slice(0, 8000), page.url, ["ceo", "chair", "cfo", "owner"]));
  }
  let intel: WebsiteIntel | null = null;
  try { intel = analyzeWebsite({ html: home.html, url: home.url }); } catch { intel = null; }
  return { website: origin, emails, phones, people, intel };
}

export async function wikipediaCompany(name: string): Promise<{
  ok: boolean;
  website?: string | null;
  people: PersonHit[];
  observations: ObservationInput[];
  sourceUrl?: string;
}> {
  const q = name.trim();
  if (q.length < 3) return { ok: false, people: [], observations: [] };
  const api = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json`;
  const r = await getJson<unknown>(api, { timeoutMs: 6000 });
  if (!r.ok || !Array.isArray(r.data)) return { ok: false, people: [], observations: [] };
  const titles = Array.isArray((r.data as unknown[])[1]) ? (r.data as unknown[])[1] as string[] : [];
  const urls = Array.isArray((r.data as unknown[])[3]) ? (r.data as unknown[])[3] as string[] : [];
  const title = titles[0];
  const sourceUrl = urls[0];
  if (!title || !sourceUrl) return { ok: false, people: [], observations: [] };
  if (!pageMentionsCompany(title, name, title)) return { ok: true, people: [], observations: [], sourceUrl };
  const page = await fetchPage(sourceUrl, 7000);
  const website = page.ok ? (extractJsonLd(page.html).orgs[0]?.url as string | undefined) ?? null : null;
  const site = website && !isDirectoryHost(website) ? canonicalCompanyWebsite(website) : null;
  const people = page.ok ? extractPeopleFromHtml(page.html, sourceUrl) : [];
  const observations: ObservationInput[] = [];
  if (site) {
    observations.push({
      field: "website",
      rawValue: site,
      normalisedValue: site,
      confidence: 70,
      sourceReliability: reliability("wikipedia"),
      extractionMethod: "wikipedia_infobox",
      sourceUrl,
      verificationStatus: "published",
      evidence: `Wikipedia page “${title}”`,
    });
  }
  return { ok: true, website: site, people, observations, sourceUrl };
}

async function duckDuckGoInstant(name: string): Promise<{ website: string | null; people: PersonHit[]; heading?: string; sourceUrl?: string }> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(name)}&format=json&no_html=1&skip_disambig=1`;
  const r = await getJson<{ AbstractURL?: string; Heading?: string; OfficialWebsite?: string; Infobox?: { content?: Array<{ label?: string; value?: string }> } }>(url, { timeoutMs: 5000 });
  if (!r.ok || !r.data) return { website: null, people: [] };
  const official = canonicalCompanyWebsite(r.data.OfficialWebsite ?? null);
  const heading = r.data.Heading ?? undefined;
  const people: PersonHit[] = [];
  for (const row of r.data.Infobox?.content ?? []) {
    if (/ceo|founder|chairman|toimitusjohtaja/i.test(row.label ?? "") && row.value) {
      const fullName = cleanPersonName(row.value);
      if (fullName) people.push({ fullName, title: row.label ?? null, seniority: "executive", sourcePage: r.data.AbstractURL ?? null, evidence: "DuckDuckGo infobox", confidence: 62, workEmail: null, workPhone: null, profileUrl: null });
    }
  }
  return { website: official && !isDirectoryHost(official) ? official : null, people, heading, sourceUrl: r.data.AbstractURL };
}

async function bingFindWebsite(name: string, municipality?: string | null): Promise<{ url: string; title: string } | null> {
  const q = [name, municipality, "yhteystiedot"].filter(Boolean).join(" ");
  try {
    const res = await safeFetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=fi-FI&cc=FI`, {
      timeoutMs: 7000,
      maxBytes: 400_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9" },
    });
    if (res.status >= 400) return null;
    const re = /<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(res.body))) {
      const url = normalizeWebsite(m[1] ?? "");
      if (!url || isDirectoryHost(url) || isJunkCompanyWebsite(url)) continue;
      if (scoreWebsiteCandidate(url, name, stripTags(m[2] ?? ""), "") >= 4) return { url, title: stripTags(m[2] ?? "") };
    }
  } catch {
    /* skip */
  }
  return null;
}

export async function collectFastContacts(opts: {
  name: string;
  municipality?: string | null;
  website?: string | null;
  street?: string | null;
  businessId?: string | null;
  country?: string | null;
  depth?: "normal" | "deep";
  emailRecovery?: boolean;
}): Promise<{
  website: string | null;
  websiteSource: string | null;
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  observations: ObservationInput[];
  sourcesChecked: string[];
  finderProfileUrl?: string | null;
  existingDead?: boolean;
}> {
  const sourcesChecked: string[] = [];
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const people: PersonHit[] = [];
  const observations: ObservationInput[] = [];
  let website = canonicalCompanyWebsite(opts.website ?? null);
  let websiteSource: string | null = website ? "existing" : null;
  const existingDead = Boolean(opts.website) && !website;
  const plan = contactPlan({ website, depth: opts.emailRecovery ? "deep" : opts.depth });
  if (opts.emailRecovery) plan.harvestBudget = 6;
  let finderProfileUrl: string | null = null;
  if (!plan.skipSearch) {
  const contactQuery = [opts.name, opts.municipality, "yhteystiedot"].filter(Boolean).join(" ");
  sourcesChecked.push("wikipedia", "duckduckgo");
  const [wiki, instant, ddgContact] = await Promise.all([
    wikipediaCompany(opts.name),
    duckDuckGoInstant(opts.name),
    duckDuckGoHtmlSearch(contactQuery, 4000),
  ]);
  for (const hit of ddgContact.hits) {
    if (/finder\.fi/i.test(hit.url) && /yhteystiedot|paattajat/i.test(hit.url)) {
      finderProfileUrl = hit.url.split("?")[0] ?? hit.url;
      break;
    }
  }
  if (wiki.ok) {
    observations.push(...wiki.observations);
    mergeUniquePeople(people, wiki.people);
    if (!website && wiki.website) {
      website = wiki.website;
      websiteSource = "wikipedia";
    }
  }
  mergeUniquePeople(people, instant.people);
  if (instant.website && !isDirectoryHost(instant.website)) {
    if (!website) {
      website = instant.website;
      websiteSource = "duckduckgo";
    }
  }
  const ddgHits = ddgContact.hits;
  if (!website) {
    const pick = pickCompanyUrl(ddgHits, opts.name);
    if (pick) {
      try {
        const probed = await probeDomain(new URL(pick.url).hostname.replace(/^www\./, ""), opts.name);
        if (probed) {
          website = probed.website;
          websiteSource = "duckduckgo";
          mergeUniqueEmails(emails, probed.emails);
          mergeUniquePhones(phones, probed.phones);
          mergeUniquePeople(people, probed.people);
        }
      } catch { /* skip */ }
    }
  }
  } // search engines skipped when a website is already known
  if (!website && plan.probeGuesses) {
    sourcesChecked.push("domain_guess");
    const guesses = domainCandidates(opts.name, opts.country).slice(0, 6);
    const probedAll = await poolMap(guesses, 4, (domain) => probeDomain(domain, opts.name));
    const probed = probedAll.find(Boolean);
    if (probed) {
      website = probed.website;
      websiteSource = "domain_guess";
      mergeUniqueEmails(emails, probed.emails);
      mergeUniquePhones(phones, probed.phones);
      mergeUniquePeople(people, probed.people);
    }
  }
  if (website) {
    sourcesChecked.push("website");
    const harvested = await harvestSite({
      website,
      companyName: opts.name,
      requireName: websiteSource === "domain_guess",
      budget: plan.harvestBudget,
      depth: opts.emailRecovery ? "deep" : opts.depth,
      exhaustive: Boolean(opts.emailRecovery),
    });
    mergeUniqueEmails(emails, harvested.emails);
    mergeUniquePhones(phones, harvested.phones);
    mergeUniquePeople(people, harvested.people);
    if (!harvested.website && websiteSource === "domain_guess") {
      website = null;
      websiteSource = null;
    }
  }
  /* Search snippets are URL evidence only — never company email/phone. */
  return {
    website,
    websiteSource,
    emails: emails.filter((e) => !isJunkEmail(e.value)),
    phones: phones.filter((p) => Boolean(normalizePhone(p.value))),
    people,
    observations,
    sourcesChecked,
    finderProfileUrl,
    existingDead,
  };
}

void expandSearchQueries;
void websiteFromPublishedEmail;
void detectTechnologies;
void looksLikeSpa;
void stripDiacritics;
void RUNTIME;
