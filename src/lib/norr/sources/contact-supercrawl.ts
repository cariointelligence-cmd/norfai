/**
 * First-party Finnish contact crawlers. No Apify, no Finder.
 * Public pages only. Never invent emails.
 */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, isJunkEmail, isRecruitingEmail, isBillingEmail } from "../contacts.ts";
import { extractJsonLd, extractPeopleFromHtml } from "../extract.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { isDirectoryHost } from "./webdiscover.ts";
import { countryEnv, nationOf } from "../countries/env.ts";

export type SuperCrawlHits = {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  website: string | null;
  sourceUrl: string | null;
  sourceId: string;
};

const EMPTY: SuperCrawlHits = { emails: [], phones: [], people: [], website: null, sourceUrl: null, sourceId: "supercrawl" };

function pushEmail(into: ContactHit[], raw: string | null | undefined, sourceUrl: string, sourceId: string): void {
  const v = (raw ?? "").replace(/^mailto:/i, "").trim().toLowerCase();
  if (!v.includes("@") || isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) return;
  if (into.some((e) => e.value === v)) return;
  into.push({
    kind: "email",
    value: v,
    classification: "published",
    sourceUrl,
    sourceId,
    evidence: "Public Finnish directory page",
    confidence: 78,
  });
}

function pushPhone(into: ContactHit[], raw: string | null | undefined, sourceUrl: string, sourceId: string): void {
  const v = normalizePhone(raw ?? "") ?? "";
  if (!v || into.some((p) => p.value === v)) return;
  into.push({
    kind: "phone",
    value: v,
    classification: "published",
    sourceUrl,
    sourceId,
    evidence: "Public Finnish directory page",
    confidence: 76,
  });
}

export function parseDirectoryContactHtml(html: string, sourceUrl: string, sourceId: string): SuperCrawlHits {
  const slice = html.length > 80_000 ? html.slice(0, 80_000) : html;
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const mailRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(slice))) pushEmail(emails, m[1] ?? "", sourceUrl, sourceId);
  if (!emails.length) {
    for (const e of extractEmails(slice)) pushEmail(emails, e.value, sourceUrl, sourceId);
  }
  const telRe = /tel:([+\d][\d\s().\-]{6,20})/gi;
  while ((m = telRe.exec(slice))) pushPhone(phones, m[1] ?? "", sourceUrl, sourceId);
  if (!phones.length) {
    for (const p of extractPhones(slice.slice(0, 20_000).replace(/<[^>]+>/g, " "), "FI")) {
      pushPhone(phones, p, sourceUrl, sourceId);
    }
  }
  if (sourceId === "kauppalehti") {
    const ld = extractJsonLd(slice);
    for (const org of ld.orgs) {
      pushEmail(emails, org.email, sourceUrl, sourceId);
      pushPhone(phones, org.telephone, sourceUrl, sourceId);
    }
  }
  let website: string | null = null;
  const site = slice.match(/https?:\/\/(?!www\.(?:020202|finder|fonecta|ytunnus|asiakastieto|kauppalehti)\.)[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (site && !isDirectoryHost(site)) website = canonicalCompanyWebsite(site);
  const people = emails.length && phones.length
    ? []
    : extractPeopleFromHtml(slice.slice(0, 12_000), sourceUrl).slice(0, 6);
  return { emails, phones, people, website, sourceUrl, sourceId };
}

async function fetchHtml(url: string, timeoutMs = 1600): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 180_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9" },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch {
    return null;
  }
}

function mergeHits(into: SuperCrawlHits, p: SuperCrawlHits): void {
  for (const e of p.emails) pushEmail(into.emails, e.value, p.sourceUrl ?? "", p.sourceId);
  for (const ph of p.phones) pushPhone(into.phones, ph.value, p.sourceUrl ?? "", p.sourceId);
  if (!into.website && p.website) into.website = p.website;
  if (!into.sourceUrl && p.emails.length) into.sourceUrl = p.sourceUrl;
  into.people.push(...p.people);
}

async function fetchParse(url: string, id: string): Promise<SuperCrawlHits> {
  const html = await fetchHtml(url);
  return html ? parseDirectoryContactHtml(html, url, id) : EMPTY;
}

async function supercrawlLive(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  country?: string | null;
}): Promise<SuperCrawlHits> {
  const name = opts.name.trim();
  if (name.length < 2) return { ...EMPTY };
  const nation = nationOf(opts.country);
  if (nation !== "FI") {
    const env = countryEnv(nation);
    const q = encodeURIComponent([name, opts.municipality].filter(Boolean).join(" "));
    const primary: Array<{ url: string; id: string }> = nation === "SE"
      ? [{ url: `https://www.allabolag.se/what/${q}`, id: "bolagsverket" }]
      : [{ url: `https://data.brreg.no/enhetsregisteret/oppslag/enheter?skipsok=false&navn=${q}`, id: "brreg" }];
    const pages = await Promise.all(primary.map((u) => fetchParse(u.url, u.id)));
    const out: SuperCrawlHits = { emails: [], phones: [], people: [], website: null, sourceUrl: null, sourceId: `${env.nation}-supercrawl` };
    for (const p of pages) mergeHits(out, p);
    return out;
  }
  const q = encodeURIComponent([name, opts.municipality].filter(Boolean).join(" "));
  const bid = (opts.businessId ?? "").replace(/\s/g, "");
  const digits = /^\d{7}-\d$/.test(bid) ? bid.replace(/\D/g, "") : "";
  const primary: Array<{ url: string; id: string }> = [
    { url: `https://www.020202.fi/haku?what=${q}`, id: "020202" },
  ];
  if (digits) primary.push({ url: `https://www.kauppalehti.fi/yritykset/yritys/${digits}`, id: "kauppalehti" });
  if (bid && /^\d{7}-\d$/.test(bid)) primary.push({ url: `https://www.ytunnus.fi/${bid}`, id: "ytunnus" });
  const pages = await Promise.all(primary.map((u) => fetchParse(u.url, u.id)));
  const out: SuperCrawlHits = { emails: [], phones: [], people: [], website: null, sourceUrl: null, sourceId: "supercrawl" };
  for (const p of pages) mergeHits(out, p);
  return out;
}

export async function supercrawlContacts(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  fresh?: boolean;
  country?: string | null;
}): Promise<SuperCrawlHits> {
  const bid = (opts.businessId ?? "").replace(/\s/g, "");
  const nation = nationOf(opts.country);
  const key = cacheKey(["supercrawl", nation, bid || opts.name.trim().toLowerCase(), opts.municipality ?? ""]);
  if (!opts.fresh) {
    const hit = cacheGet<SuperCrawlHits>(key);
    if (hit?.emails?.length) return hit;
  }
  const live = await supercrawlLive(opts);
  if (live.emails.length) cacheSet(key, live, CACHE_TTL.contacts);
  return live;
}
