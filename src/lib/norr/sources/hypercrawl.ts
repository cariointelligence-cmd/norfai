/** First-party hypercrawler. Discovers country contact pages from the homepage, then fetches them. Never mixes FI/SE/NO hosts. */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, isJunkEmail, isBillingEmail, isRecruitingEmail } from "../contacts.ts";
import { extractJsonLd, extractPeopleFromHtml } from "../extract.ts";
import { extractDecisionMakersFromHtml } from "./dm-extract.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { countryEnv, nationOf, type Nation } from "../countries/env.ts";
import { poolMap } from "../engines.ts";

export type HyperHits = {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  pages: number;
  urls: string[];
};

const HINT: Record<Nation, RegExp> = {
  FI: /yhteystiedot|yhteydenotto|tiimi|johto|hallitus|henkilost|meista|meistä|yritys|contact|team|about/i,
  SE: /kontakt|kontakta|ledning|styrelse|medarbetare|personal|om-oss|omoss|about|team|contact/i,
  NO: /kontakt|ledelse|ledelsen|styret|ansatte|personer|om-oss|omoss|about|team|contact/i,
};

const SKIP = /privacy|cookie|login|cart|checkout|wp-admin|cdn-cgi|facebook|linkedin|instagram|twitter|youtube|bike|lease|kampanj|campaign|blogg|blog|nyhet/i;

export function scoreCountryPath(path: string, nation: Nation): number {
  const p = path.toLowerCase();
  if (SKIP.test(p)) return -20;
  let s = 0;
  if (HINT[nation].test(p)) s += 10;
  if (/\/(fi|sv|se|nb|no|en)\//i.test(p) && HINT[nation].test(p)) s += 3;
  if (/team|people|staff|management|leadership|about|contact/.test(p)) s += 4;
  return s;
}

export function countryLinksFromHtml(html: string, origin: string, nation: Nation): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let host: string;
  try { host = new URL(origin).host.replace(/^www\./, ""); } catch { return out; }
  const re = /href=["']([^"'#?]+)/gi;
  let m: RegExpExecArray | null;
  const scored: Array<{ url: string; score: number }> = [];
  while ((m = re.exec(html.slice(0, 80_000)))) {
    const raw = (m[1] ?? "").trim();
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    let abs: URL;
    try { abs = new URL(raw, origin); } catch { continue; }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (abs.host.replace(/^www\./, "") !== host) continue;
    const score = scoreCountryPath(abs.pathname, nation);
    if (score < 6) continue;
    const url = `${abs.origin}${abs.pathname.replace(/\/+$/, "")}` || abs.origin;
    if (seen.has(url)) continue;
    seen.add(url);
    scored.push({ url, score });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const row of scored) {
    if (out.length >= 6) break;
    out.push(row.url);
  }
  return out;
}

function originOf(website: string): string | null {
  const w = canonicalCompanyWebsite(website);
  if (!w) return null;
  try {
    const u = new URL(w);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, acceptLanguage: string, timeoutMs = 1400): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 140_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": acceptLanguage },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch {
    return null;
  }
}

function ingest(
  html: string,
  url: string,
  envNation: Nation,
  phoneRegion: "FI" | "SE" | "NO",
  emails: ContactHit[],
  phones: ContactHit[],
  people: PersonHit[],
): void {
  const slice = html.length > 70_000 ? html.slice(0, 70_000) : html;
  try {
    const ld = extractJsonLd(slice);
    for (const org of ld.orgs) {
      pushEmail(emails, org.email, url, envNation);
      pushPhone(phones, org.telephone, url, phoneRegion, envNation);
    }
    for (const person of ld.persons) {
      pushEmail(emails, person.email, url, envNation);
      if (person.name) {
        people.push({
          fullName: person.name,
          title: person.jobTitle ?? null,
          workEmail: person.email ?? null,
          workPhone: person.telephone ?? null,
          sourcePage: url,
          confidence: 80,
        });
      }
    }
  } catch { /* optional */ }
  for (const e of extractEmails(slice)) pushEmail(emails, e.value, url, envNation);
  const mailRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(slice))) pushEmail(emails, m[1], url, envNation);
  const telRe = /tel:([+\d][\d\s().\-]{6,20})/gi;
  while ((m = telRe.exec(slice))) pushPhone(phones, m[1], url, phoneRegion, envNation);
  for (const p of extractPhones(slice.replace(/<[^>]+>/g, " ").slice(0, 16_000), phoneRegion)) {
    pushPhone(phones, p, url, phoneRegion, envNation);
  }
  people.push(...extractPeopleFromHtml(slice.slice(0, 16_000), url).slice(0, 8));
  people.push(...extractDecisionMakersFromHtml(slice, url, envNation));
}

function pushEmail(into: ContactHit[], raw: string | null | undefined, url: string, nation: Nation): void {
  const v = (raw ?? "").replace(/^mailto:/i, "").trim().toLowerCase();
  if (!v.includes("@") || isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) return;
  if (into.some((e) => e.value === v)) return;
  into.push({
    kind: "email",
    value: v,
    classification: "published",
    sourceId: "hypercrawl",
    sourceUrl: url,
    evidence: `First-party ${nation} page`,
    confidence: 84,
  });
}

function pushPhone(into: ContactHit[], raw: string | null | undefined, url: string, region: "FI" | "SE" | "NO", nation: Nation): void {
  const v = normalizePhone(raw ?? "", region) ?? normalizePhone(raw ?? "") ?? "";
  if (!v || into.some((p) => p.value === v)) return;
  if (v.startsWith("+00")) return;
  if (nation === "FI" && !v.startsWith("+358")) return;
  if (nation === "SE" && !v.startsWith("+46")) return;
  if (nation === "NO" && !v.startsWith("+47")) return;
  if (v.replace(/\D/g, "").length < 10) return;
  into.push({
    kind: "phone",
    value: v,
    classification: "published",
    sourceId: "hypercrawl",
    sourceUrl: url,
    evidence: `First-party ${nation} page`,
    confidence: 80,
  });
}

export async function hypercrawlSite(opts: {
  website?: string | null;
  country?: string | null;
  companyName?: string;
  skipHome?: boolean;
  haveEmail?: boolean;
  havePhone?: boolean;
}): Promise<HyperHits> {
  const empty: HyperHits = { emails: [], phones: [], people: [], pages: 0, urls: [] };
  const origin = originOf(opts.website ?? "");
  if (!origin) return empty;
  const env = countryEnv(opts.country);
  const nation = nationOf(opts.country);
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const people: PersonHit[] = [];
  const used: string[] = [];
  let homeHtml: string | null = null;
  if (!opts.skipHome) {
    homeHtml = await fetchHtml(origin, env.acceptLanguage, 1800);
    if (homeHtml) {
      used.push(origin);
      ingest(homeHtml, origin, nation, env.phoneRegion, emails, phones, people);
    }
  }
  const discovered = homeHtml ? countryLinksFromHtml(homeHtml, origin, nation) : [];
  const fallbacks = env.sitePaths.map((p) => origin + p);
  const extra: string[] = [];
  const seen = new Set([origin, origin + "/"]);
  const wantPeople = !(opts.haveEmail && opts.havePhone) || people.length === 0;
  const pool = wantPeople ? [...discovered, ...fallbacks] : discovered.filter((u) => /tiimi|team|johto|ledning|ledelse|styre|hallitus|medarbet|ansatte|people/i.test(u));
  for (const u of pool) {
    if (seen.has(u) || extra.length >= 5) continue;
    seen.add(u);
    extra.push(u);
  }
  const pages = await poolMap(extra, 4, async (u) => {
    const html = await fetchHtml(u, env.acceptLanguage);
    return html ? { u, html } : null;
  });
  for (const row of pages) {
    if (!row) continue;
    used.push(row.u);
    ingest(row.html, row.u, nation, env.phoneRegion, emails, phones, people);
    if (emails.length >= 2 && phones.length >= 1 && people.length >= 1) break;
  }
  const uniqPeople: PersonHit[] = [];
  const seenP = new Set<string>();
  for (const p of people) {
    const k = (p.fullName ?? "").toLowerCase();
    if (!k || seenP.has(k)) continue;
    seenP.add(k);
    uniqPeople.push(p);
    if (uniqPeople.length >= 12) break;
  }
  return { emails, phones, people: uniqPeople, pages: used.length, urls: used };
}
