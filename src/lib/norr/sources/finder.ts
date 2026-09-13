import type { ContactHit, DiscoveredCompany, ObservationInput, PersonHit } from "../types.ts";
import { extractPeopleFromText, extractPeopleFromHtml, extractJsonLd, stripTags, plausiblePersonName, decodeHref } from "../extract.ts";
import { extractEmails, extractPhones, isJunkEmail, isRecruitingEmail } from "../contacts.ts";
import { canonicalCompanyWebsite, normalizeBusinessId, normalizeName, normalizePhone } from "../normalize.ts";
import { reliability } from "./catalog.ts";
import { fetchRendered, playwrightAvailable } from "../browser.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { duckDuckGoHtmlSearch } from "./webdiscover.ts";
import { coreCompanyName, isDistinctiveCoreName } from "../dedupe.ts";
import { getJson } from "../http.ts";
import { bidFromFinderUrl, bidFromSnippet } from "./register-gate.ts";

const FINDER_ORIGIN = "https://www.finder.fi";

export type FinderSearchHit = {
  name: string;
  url: string;
  city?: string | null;
  snippet?: string | null;
};

export type FinderProfile = {
  name: string | null;
  businessId: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  municipality: string | null;
  people: PersonHit[];
  emails: ContactHit[];
  phones: ContactHit[];
  sourceUrl: string;
  ceased: boolean;
};

export function finderNamesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = coreCompanyName(a);
  const cb = coreCompanyName(b);
  if (ca && cb && ca === cb && isDistinctiveCoreName(ca)) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  const tok = (s: string) => s.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const aa = tok(na);
  const bb = tok(nb);
  if (!aa.length || !bb.length) return false;
  return aa.some((t) => bb.includes(t));
}

export function nameFromFinderUrl(url: string): { name: string; city: string | null } {
  try {
    const parts = decodeURIComponent(new URL(url).pathname).split("/").filter(Boolean);
    const name = (parts[0] ?? "").replace(/\+/g, " ").trim();
    const maybeCity = (parts[1] ?? "").replace(/\+/g, " ").trim();
    const city = maybeCity && !/yhteystiedot|paattajat|päättäjät/i.test(maybeCity) ? maybeCity : null;
    return { name, city };
  } catch {
    return { name: "", city: null };
  }
}

export function parseFinderSearchHtml(html: string, base = FINDER_ORIGIN): FinderSearchHit[] {
  const out: FinderSearchHit[] = [];
  const seen = new Set<string>();
  const push = (rawHref: string, label: string, snippet?: string) => {
    let href = decodeHref(rawHref);
    const nested = /[?&]uddg=([^&]+)/i.exec(href) ?? /uddg=([^&]+)/i.exec(rawHref);
    if (nested?.[1]) href = decodeHref(nested[1]);
    if (!/finder\.fi/i.test(href) || !/yhteystiedot|paattajat|päättäjät/i.test(href)) return;
    try {
      const url = new URL(href, base).toString().split("?")[0] ?? href;
      const canon = url.replace(/\/(paattajat|päättäjät)\//i, "/yhteystiedot/");
      if (seen.has(canon) || !/finder\.fi/i.test(canon)) return;
      seen.add(canon);
      const parsed = nameFromFinderUrl(canon);
      const cleaned = (label.replace(/\s+/g, " ").trim() || parsed.name).replace(/\s+[-|].*$/, "").trim();
      if (/näytä yrityksen tiedot|nayta yrityksen tiedot/i.test(cleaned) && !parsed.name) return;
      out.push({ name: cleaned || parsed.name, url: canon, city: parsed.city, snippet: snippet ?? null });
    } catch {
      /* skip */
    }
  };
  const re = /href=["']([^"']*(?:yhteystiedot|paattajat|päättäjät)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) push(m[1] ?? "", stripTags(m[2] ?? ""));
  const uddg = /uddg=([^"'&]+)/gi;
  while ((m = uddg.exec(html))) push(m[1] ?? "", "");
  const ru = /RU=([^/&]+)/g;
  while ((m = ru.exec(html))) push(m[1] ?? "", "");
  const bare = /https?:\/\/(?:www\.)?finder\.fi\/[^\s"'<>\\]+(?:yhteystiedot|paattajat)\/\d+/gi;
  while ((m = bare.exec(html))) push(m[0], "");
  const cite = /(?:www\.)?finder\.fi\s*(?:›|>|\/)\s*([^<]{3,80})/gi;
  while ((m = cite.exec(html))) {
    const crumb = stripTags(m[1] ?? "").replace(/\s*(?:›|>)\s*/g, "/").trim();
    if (!crumb) continue;
    const bits = crumb.split("/").map((s) => s.trim()).filter(Boolean);
    const name = bits[0] ?? "";
    if (name && /yhteystiedot|paattajat/i.test(crumb)) {
      out.push({ name: name.replace(/\+/g, " "), url: `${FINDER_ORIGIN}/${bits.map((b) => b.replace(/\s+/g, "+")).join("/")}`, city: bits[1] ?? null, snippet: null });
    }
  }
  return out.filter((h) => h.url.includes("yhteystiedot") || h.url.includes("finder.fi"));
}

export function guessedFinderUrls(opts: { name: string; municipality?: string | null; businessId?: string | null }): string[] {
  const slug = opts.name.trim().replace(/\s+/g, "+");
  if (!slug) return [];
  const city = (opts.municipality ?? "").trim().replace(/\s+/g, "+");
  const digits = (opts.businessId ?? "").replace(/\D/g, "");
  const ids = new Set<string>();
  if (digits.length >= 7) {
    ids.add(digits.slice(0, 7));
    ids.add(digits.slice(0, 7).replace(/^0+/, "") || digits.slice(0, 7));
  }
  const out: string[] = [];
  for (const id of ids) {
    if (city) out.push(`${FINDER_ORIGIN}/${slug}/${city}/yhteystiedot/${id}`);
    out.push(`${FINDER_ORIGIN}/${slug}/yhteystiedot/${id}`);
  }
  return out;
}

function isWafBody(html: string): boolean {
  return /Just a moment|awsWaf|challenge-form|cf-challenge|Access Denied/i.test(html) && html.length < 80_000;
}

async function fetchFinderHttp(url: string): Promise<{ ok: boolean; html: string; text: string; url: string; status: number; waf: boolean }> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 8000,
      maxBytes: 1_200_000,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
      },
    });
    const waf = res.status === 202 || isWafBody(res.body);
    if (res.status >= 400 || waf || res.body.length < 1500) {
      return { ok: false, html: res.body, text: "", url: res.url, status: res.status, waf };
    }
    return { ok: true, html: res.body, text: stripTags(res.body), url: res.url, status: res.status, waf: false };
  } catch {
    return { ok: false, html: "", text: "", url, status: 0, waf: false };
  }
}

async function fetchFinderPage(url: string, waitMs = 900, allowRender = true): Promise<{ ok: boolean; html: string; text: string; url: string; status: number; error?: string }> {
  const http = await fetchFinderHttp(url);
  if (http.ok) return http;
  if (http.waf && !allowRender) {
    const archived = await waybackHtml(url);
    if (archived) return archived;
  }
  if (!allowRender || !playwrightAvailable()) return { ...http, error: http.status ? `HTTP ${http.status}` : "Finder blocked" };
  const rendered = await fetchRendered(url, { waitMs, timeoutMs: 16000 });
  const ok = rendered.ok && rendered.html.length > 1500 && !isWafBody(rendered.html);
  if (ok) return { ok: true, html: rendered.html, text: rendered.text, url: rendered.url, status: rendered.status };
  const archived = await waybackHtml(url);
  if (archived) return archived;
  return {
    ok: false,
    html: rendered.html,
    text: rendered.text,
    url: rendered.url,
    status: rendered.status,
    error: rendered.error ?? "Finder WAF",
  };
}

async function waybackHtml(url: string): Promise<{ ok: boolean; html: string; text: string; url: string; status: number } | null> {
  try {
    const r = await getJson<{ archived_snapshots?: { closest?: { url?: string; available?: boolean } } }>(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { timeoutMs: 5000 },
    );
    const snap = r.ok ? r.data.archived_snapshots?.closest : null;
    if (!snap?.available || !snap.url) return null;
    const res = await safeFetch(snap.url, {
      timeoutMs: 8000,
      maxBytes: 1_200_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (res.status >= 400 || res.body.length < 1500 || isWafBody(res.body)) return null;
    return { ok: true, html: res.body, text: stripTags(res.body), url: res.url || snap.url, status: res.status };
  } catch {
    return null;
  }
}

function labelValue(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:?\\s+([^\\n]{2,80})`, "i");
  const m = re.exec(text);
  if (!m?.[1]) return null;
  const v = m[1].replace(/\s+/g, " ").trim();
  const cut = v.search(/\s+(Sähköposti|Puhelinnumero|Nettisivut|Y-tunnus|Toimipaikan|Postiosoite|Virallinen|Päättäjät)\b/i);
  return (cut > 0 ? v.slice(0, cut) : v).trim() || null;
}

export function parseFinderProfileHtml(html: string, sourceUrl: string, textHint?: string): FinderProfile {
  const text = (textHint && textHint.length > 40 ? textHint : stripTags(html)).replace(/\u00a0/g, " ");
  const jsonLd = extractJsonLd(html);
  const org = jsonLd.orgs[0] ?? {};
  const emailFromLd = typeof org.email === "string" ? org.email.replace(/^mailto:/i, "").trim().toLowerCase() : null;
  const phoneFromLd = typeof org.telephone === "string" ? org.telephone : null;
  const siteFromLd = typeof org.url === "string" ? org.url : typeof (org as { sameAs?: unknown }).sameAs === "string" ? String((org as { sameAs: string }).sameAs) : null;

  const emailRaw = emailFromLd || labelValue(text, "Sähköposti") || extractEmails(text)[0]?.value || null;
  const phoneRaw = phoneFromLd || labelValue(text, "Puhelinnumero") || extractPhones(text, "FI")[0] || null;
  const siteRaw = siteFromLd || labelValue(text, "Nettisivut");
  const bidRaw = text.match(/\b(\d{7}-\d)\b/)?.[1] || labelValue(text, "Y-tunnus");
  const name = typeof org.name === "string" ? org.name : labelValue(text, "Virallinen nimi");
  const address = typeof org.address === "string" ? org.address : labelValue(text, "Toimipaikan osoite") || labelValue(text, "Postiosoite");

  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  if (emailRaw && !isJunkEmail(emailRaw) && !isRecruitingEmail(emailRaw) && emailRaw.includes("@")) {
    emails.push({
      kind: "email",
      value: emailRaw.toLowerCase(),
      classification: "published",
      sourceUrl,
      sourceId: "finder",
      evidence: "Fonecta Finder company profile",
      confidence: 86,
    });
  }
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phone) {
    phones.push({
      kind: "phone",
      value: phone,
      classification: "published",
      sourceUrl,
      sourceId: "finder",
      evidence: "Fonecta Finder company profile",
      confidence: 84,
    });
  }

  const paattajat = html.split(/Päättäjät|Paattajat|Vastuuhenkilöt|tab-decisionMakers/i)[1]?.slice(0, 12000) ?? "";
  const people = [
    ...extractPeopleFromHtml(html, sourceUrl),
    ...extractPeopleFromHtml(paattajat, sourceUrl),
    ...extractPeopleFromText(stripTags(paattajat), sourceUrl, ["ceo", "chair", "cfo", "board", "owner"]),
    ...jsonLd.persons.map((p) => ({
      fullName: p.name ?? "",
      title: p.jobTitle ?? null,
      seniority: /johtaja|ceo|director|board|chair/i.test(p.jobTitle ?? "") ? "executive" : "unknown",
      sourcePage: sourceUrl,
      evidence: "Finder JSON-LD Person",
      confidence: 82,
      workEmail: p.email ? String(p.email).replace(/^mailto:/i, "").toLowerCase() : null,
      workPhone: p.telephone ? normalizePhone(p.telephone) : null,
      profileUrl: p.url ?? null,
    })),
  ]
    .filter((p) => plausiblePersonName(p.fullName))
    .map((p) => ({
      fullName: p.fullName,
      title: p.title,
      seniority: p.seniority,
      sourcePage: sourceUrl,
      evidence: p.evidence ?? "Finder Päättäjät",
      confidence: Math.min(p.confidence, 82),
      workEmail: p.workEmail ?? null,
      workPhone: p.workPhone ?? null,
      profileUrl: p.profileUrl ?? null,
    })) as PersonHit[];

  let street: string | null = null;
  let municipality: string | null = null;
  if (address) {
    const bits = (typeof address === "string" ? address : String(address)).split(",").map((s) => s.trim()).filter(Boolean);
    street = bits[0] ?? null;
    const last = bits[bits.length - 1] ?? "";
    municipality = last.replace(/^\d{5}\s*/, "").trim() || null;
  }

  return {
    name: name ?? null,
    businessId: normalizeBusinessId(bidRaw),
    website: canonicalCompanyWebsite(siteRaw),
    email: emails[0]?.value ?? null,
    phone: phones[0]?.value ?? null,
    street,
    municipality,
    people,
    emails,
    phones,
    sourceUrl,
    ceased: /toiminta on lakannut|ceased|toiminta päättynyt/i.test(text),
  };
}

export function profileFromSearchHit(hit: FinderSearchHit): FinderProfile | null {
  const blob = `${hit.name} ${hit.snippet ?? ""}`;
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  for (const e of extractEmails(blob)) {
    if (isJunkEmail(e.value) || isRecruitingEmail(e.value) || /finder\.fi|fonecta/i.test(e.value)) continue;
    emails.push({
      kind: "email",
      value: e.value,
      classification: "published",
      sourceUrl: hit.url,
      sourceId: "finder",
      evidence: "Finder listing snippet",
      confidence: 64,
    });
  }
  for (const p of extractPhones(blob, "FI")) {
    const phone = normalizePhone(p);
    if (!phone) continue;
    phones.push({
      kind: "phone",
      value: phone,
      classification: "published",
      sourceUrl: hit.url,
      sourceId: "finder",
      evidence: "Finder listing snippet",
      confidence: 62,
    });
  }
  const people = extractPeopleFromText(blob, hit.url, ["ceo", "chair", "cfo", "owner"]).map((p) => ({
    ...p,
    evidence: "Finder listing snippet",
    confidence: Math.min(p.confidence, 58),
  }));
  if (!emails.length && !phones.length && !people.length && !hit.city) return null;
  return {
    name: hit.name,
    businessId: normalizeBusinessId(blob.match(/\b(\d{7}-\d)\b/)?.[1] ?? null),
    website: null,
    email: emails[0]?.value ?? null,
    phone: phones[0]?.value ?? null,
    street: null,
    municipality: hit.city ?? null,
    people,
    emails,
    phones,
    sourceUrl: hit.url,
    ceased: /lakannut|konkurss/i.test(blob),
  };
}

export function pickFinderHit(hits: FinderSearchHit[], name: string, municipality?: string | null): FinderSearchHit | null {
  const scored = hits
    .map((h) => {
      let score = 0;
      if (finderNamesMatch(h.name, name)) score += 8;
      else return { h, score: 0 };
      if (municipality && h.city && normalizeName(h.city) === normalizeName(municipality)) score += 3;
      if (normalizeName(h.name) === normalizeName(name)) score += 4;
      if (h.snippet && /\d{7}-\d/.test(h.snippet)) score += 1;
      return { h, score };
    })
    .filter((x) => x.score >= 8)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.h ?? null;
}

async function yahooHtmlSearch(query: string): Promise<FinderSearchHit[]> {
  const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}&fr=sfp&ei=UTF-8`;
  try {
    const res = await safeFetch(url, {
      timeoutMs: 7000,
      maxBytes: 500_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8" },
    });
    if (res.status >= 400) return [];
    return parseFinderSearchHtml(res.body, FINDER_ORIGIN);
  } catch {
    return [];
  }
}

async function bingHtmlSearch(query: string): Promise<FinderSearchHit[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fi-FI&cc=FI&count=20`;
  try {
    const res = await safeFetch(url, {
      timeoutMs: 7000,
      maxBytes: 500_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9" },
    });
    if (res.status >= 400) return [];
    return parseFinderSearchHtml(res.body, FINDER_ORIGIN);
  } catch {
    return [];
  }
}

export async function finderSearchPages(query: string, pages = 2, allowRender = false): Promise<FinderSearchHit[]> {
  const all: FinderSearchHit[] = [];
  const seen = new Set<string>();
  const push = (h: FinderSearchHit) => {
    if (!h.url || seen.has(h.url)) return;
    if (!/finder\.fi/i.test(h.url)) return;
    seen.add(h.url);
    all.push(h);
  };

  const ddg = await duckDuckGoHtmlSearch(`site:finder.fi ${query} yhteystiedot`, 4000).catch(() => ({
    hits: [] as Array<{ url: string; title: string; snippet: string }>,
  }));
  for (const hit of ddg.hits) {
    if (!/finder\.fi/i.test(hit.url)) continue;
    const parsed = nameFromFinderUrl(hit.url);
    push({ name: parsed.name || hit.title || query, url: hit.url, city: parsed.city, snippet: hit.snippet || null });
  }
  if (all.length) return all;

  const searchUrl = `${FINDER_ORIGIN}/search?what=${encodeURIComponent(query)}`;
  const rendered = await fetchFinderPage(searchUrl, 700, allowRender === true);
  if (rendered.ok) {
    for (const h of parseFinderSearchHtml(rendered.html, FINDER_ORIGIN)) push(h);
  }
  if (!all.length && pages > 1 && rendered.ok) {
    const page2 = `${FINDER_ORIGIN}/search?what=${encodeURIComponent(query)}&page=2`;
    const more = await fetchFinderPage(page2, 600, false);
    if (more.ok) for (const h of parseFinderSearchHtml(more.html, FINDER_ORIGIN)) push(h);
  }
  return all;
}

export async function finderLookup(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  profileUrl?: string | null;
  allowRender?: boolean;
}): Promise<{
  ok: boolean;
  profile: FinderProfile | null;
  sourceUrl: string;
  error?: string;
  observations: ObservationInput[];
}> {
  const rel = reliability("finder");
  const emptyObs = (evidence: string, url: string): ObservationInput[] => [
    {
      field: "finder_profile",
      rawValue: "not_found",
      normalisedValue: "not_found",
      confidence: 40,
      sourceReliability: rel,
      extractionMethod: "finder_html",
      sourceUrl: url,
      verificationStatus: "not_found",
      evidence,
    },
  ];
  const allowRender = opts.allowRender === true;
  let hits: FinderSearchHit[] = [];
  let profileUrl = opts.profileUrl ?? null;
  const guessed = guessedFinderUrls({ name: opts.name, municipality: opts.municipality, businessId: opts.businessId });
  if (!profileUrl && !guessed.length) {
    const queries = [
      `site:finder.fi ${[opts.name, opts.businessId].filter(Boolean).join(" ")}`,
      [opts.name, opts.municipality].filter(Boolean).join(" "),
    ].filter((q, i, arr) => q && arr.indexOf(q) === i);
    const found = await Promise.all(queries.map((q) => finderSearchPages(q, 1, false)));
    hits = found.flat();
    const pick = pickFinderHit(hits, opts.name, opts.municipality);
    if (pick) profileUrl = pick.url;
    else if (hits[0] && finderNamesMatch(hits[0].name, opts.name)) profileUrl = hits[0].url;
  }
  const candidates = [...new Set([profileUrl, ...guessed].filter((u): u is string => Boolean(u)))];
  if (!candidates.length) {
    const url = `${FINDER_ORIGIN}/search?what=${encodeURIComponent(opts.name)}`;
    const snippetHit = pickFinderHit(hits, opts.name, opts.municipality) ?? hits[0] ?? null;
    if (snippetHit && finderNamesMatch(snippetHit.name, opts.name)) {
      const snippet = profileFromSearchHit(snippetHit);
      if (snippet) return observationsFromProfile(snippet, opts.name, rel);
    }
    return { ok: true, profile: null, sourceUrl: url, observations: emptyObs(`No Finder listing matched ${opts.name}`, url) };
  }

  let waf = false;
  for (const url of candidates) {
    const http = await fetchFinderHttp(url);
    if (http.waf) {
      waf = true;
      break;
    }
    if (!http.ok) continue;
    const profile = parseFinderProfileHtml(http.html, url, http.text);
    if (opts.name && profile.name && !finderNamesMatch(profile.name, opts.name) && !finderNamesMatch(opts.name, profile.name)) continue;
    return observationsFromProfile(profile, opts.name, rel);
  }

  if (waf && allowRender && candidates[0]) {
    const rendered = await fetchFinderPage(candidates[0], 1100, true);
    if (rendered.ok) {
      const profile = parseFinderProfileHtml(rendered.html, candidates[0], rendered.text);
      if (!(opts.name && profile.name && !finderNamesMatch(profile.name, opts.name))) {
        return observationsFromProfile(profile, opts.name, rel);
      }
    }
  } else if (waf && allowRender && candidates[0]) {
    const archived = await waybackHtml(candidates[0]);
    if (archived?.ok) {
      const profile = parseFinderProfileHtml(archived.html, candidates[0], archived.text);
      if (!(opts.name && profile.name && !finderNamesMatch(profile.name, opts.name))) {
        return observationsFromProfile(profile, opts.name, rel);
      }
    }
  }

  const snippetHit = pickFinderHit(hits, opts.name, opts.municipality);
  if (snippetHit) {
    const snippet = profileFromSearchHit(snippetHit);
    if (snippet) return observationsFromProfile(snippet, opts.name, rel);
  }
  return {
    ok: true,
    profile: null,
    sourceUrl: candidates[0] ?? FINDER_ORIGIN,
    observations: emptyObs(waf ? "Finder public page challenged; other directories still run" : `No Finder listing matched ${opts.name}`, candidates[0] ?? FINDER_ORIGIN),
  };
}

function observationsFromProfile(profile: FinderProfile, name: string, rel: number): {
  ok: boolean;
  profile: FinderProfile;
  sourceUrl: string;
  observations: ObservationInput[];
} {
  const profileUrl = profile.sourceUrl;
  const observations: ObservationInput[] = [
    {
      field: "finder_profile",
      rawValue: profileUrl,
      normalisedValue: profileUrl,
      confidence: 88,
      sourceReliability: rel,
      extractionMethod: "finder_html",
      sourceUrl: profileUrl,
      verificationStatus: "published",
      evidence: `Fonecta Finder profile for ${profile.name ?? name}`,
    },
  ];
  if (profile.website) {
    observations.push({
      field: "website",
      rawValue: profile.website,
      normalisedValue: profile.website,
      confidence: 84,
      sourceReliability: rel,
      extractionMethod: "finder_jsonld",
      sourceUrl: profileUrl,
      verificationStatus: "published",
      evidence: "Finder Nettisivut / JSON-LD sameAs",
    });
  }
  if (profile.email) {
    observations.push({
      field: "email",
      rawValue: profile.email,
      normalisedValue: profile.email,
      confidence: 86,
      sourceReliability: rel,
      extractionMethod: "finder_jsonld",
      sourceUrl: profileUrl,
      verificationStatus: "published",
      evidence: "Finder Sähköposti",
    });
  }
  if (profile.phone) {
    observations.push({
      field: "phone",
      rawValue: profile.phone,
      normalisedValue: profile.phone,
      confidence: 84,
      sourceReliability: rel,
      extractionMethod: "finder_jsonld",
      sourceUrl: profileUrl,
      verificationStatus: "published",
      evidence: "Finder Puhelinnumero",
    });
  }
  if (profile.businessId) {
    observations.push({
      field: "business_id",
      rawValue: profile.businessId,
      normalisedValue: profile.businessId,
      confidence: 90,
      sourceReliability: rel,
      extractionMethod: "finder_html",
      sourceUrl: profileUrl,
      verificationStatus: "published",
      evidence: "Finder Y-tunnus",
    });
  }
  return { ok: true, profile, sourceUrl: profileUrl, observations };
}

export function discoveredFromFinderHit(h: FinderSearchHit, municipality?: string | null): DiscoveredCompany {
  return {
    name: h.name,
    country: "FI",
    municipality: h.city ?? municipality ?? null,
    businessId: bidFromFinderUrl(h.url) ?? bidFromSnippet(`${h.name} ${h.snippet ?? ""}`),
  };
}

export async function finderDiscover(opts: {
  keyword?: string | null;
  municipality?: string | null;
  max: number;
}): Promise<{ companies: DiscoveredCompany[]; profileUrls: Map<string, string>; sourceUrl: string }> {
  const term = (opts.keyword || "").trim();
  if (!term) return { companies: [], profileUrls: new Map(), sourceUrl: FINDER_ORIGIN };
  const q = [term, opts.municipality].filter(Boolean).join(" ");
  const pages = Math.min(2, Math.max(1, Math.ceil(opts.max / 12)));
  const hits = await finderSearchPages(q, pages, false);
  const companies: DiscoveredCompany[] = [];
  const profileUrls = new Map<string, string>();
  const seen = new Set<string>();
  for (const h of hits) {
    const core = coreCompanyName(h.name);
    const key = isDistinctiveCoreName(core) ? core : normalizeName(h.name);
    if (!key || seen.has(key)) continue;
    if (/lakannut|konkurss|ceased/i.test(`${h.name} ${h.snippet ?? ""}`)) continue;
    seen.add(key);
    const row = discoveredFromFinderHit(h, opts.municipality);
    companies.push(row);
    profileUrls.set(key, h.url);
    profileUrls.set(normalizeName(h.name), h.url);
    if (row.businessId) profileUrls.set(row.businessId, h.url);
    if (companies.length >= opts.max) break;
  }
  return {
    companies,
    profileUrls,
    sourceUrl: `${FINDER_ORIGIN}/search?what=${encodeURIComponent(q)}`,
  };
}
