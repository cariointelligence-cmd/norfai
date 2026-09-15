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
import { nationOf } from "../countries/env.ts";
import { cacheGet, cacheSet, cacheKey, CACHE_TTL } from "../intel-cache.ts";
import { swedenHelper, norwayHelper } from "./nation-helpers.ts";
import { runNationFleet } from "./nation-fleet.ts";

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
  const siteRe = /https?:\/\/(?!www\.(?:finder|fonecta|kauppalehti|020202|ytunnus|proff))[a-z0-9.-]+\.fi\b/i;
  const site = slice.match(siteRe)?.[0];
  if (site) {
    const w = canonicalCompanyWebsite(site);
    if (w && !isDirectoryHost(w)) website = w;
  }
  const people = extractPeopleFromHtml(slice.slice(0, 12_000), sourceUrl).slice(0, 8);
  return { emails, phones, people, website, sourceUrl, sourceId };
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 1400,
      maxBytes: 140_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9" },
    });
    if (res.status >= 400 || res.body.length < 40) return null;
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
  limit?: number;
  only?: string[];
}): Promise<SuperCrawlHits> {
  const name = opts.name.trim();
  if (name.length < 2) return { ...EMPTY };
  const nation = nationOf(opts.country);
  const fleetSkip = nation === "FI" ? ["fi_020202", "fi_ytunnus", "fi_kauppalehti_id"] : [];
  const fleetOpts = { limit: opts.limit, only: opts.only };
  if (nation === "SE") {
    const h = await swedenHelper({ name, municipality: opts.municipality });
    const out: SuperCrawlHits = { emails: h.emails, phones: h.phones, people: h.people, website: h.website, sourceUrl: null, sourceId: h.sourceId };
    const fleet = await runNationFleet({ country: "SE", name, businessId: opts.businessId, municipality: opts.municipality, website: h.website, skip: ["se_allabolag_search"], ...fleetOpts }).catch(() => null);
    if (fleet) mergeHits(out, { emails: fleet.emails, phones: fleet.phones, people: fleet.people, website: fleet.website, sourceUrl: null, sourceId: "fleet" });
    return out;
  }
  if (nation === "NO") {
    const h = await norwayHelper({ name, municipality: opts.municipality });
    const out: SuperCrawlHits = { emails: h.emails, phones: h.phones, people: h.people, website: h.website, sourceUrl: null, sourceId: h.sourceId };
    const fleet = await runNationFleet({ country: "NO", name, businessId: opts.businessId || h.businessId, municipality: opts.municipality, website: h.website, ...fleetOpts }).catch(() => null);
    if (fleet) mergeHits(out, { emails: fleet.emails, phones: fleet.phones, people: fleet.people, website: fleet.website, sourceUrl: null, sourceId: "fleet" });
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
  const fleet = await runNationFleet({ country: "FI", name, businessId: opts.businessId, municipality: opts.municipality, website: out.website, skip: fleetSkip, ...fleetOpts }).catch(() => null);
  if (fleet) mergeHits(out, { emails: fleet.emails, phones: fleet.phones, people: fleet.people, website: fleet.website, sourceUrl: null, sourceId: "fleet" });
  return out;
}

export async function supercrawlContacts(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  fresh?: boolean;
  country?: string | null;
  limit?: number;
  only?: string[];
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
