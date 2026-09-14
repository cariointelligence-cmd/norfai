/**
 * First-party Finnish contact crawlers. No Apify.
 * Public pages only: 020202, y-tunnus.fi. Never invent emails.
 */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, isJunkEmail, isRecruitingEmail, isBillingEmail } from "../contacts.ts";
import { extractPeopleFromHtml } from "../extract.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { isDirectoryHost } from "./webdiscover.ts";

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
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const mailRe = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailRe.exec(html))) pushEmail(emails, m[1] ?? "", sourceUrl, sourceId);
  for (const e of extractEmails(html)) pushEmail(emails, e.value, sourceUrl, sourceId);
  const telRe = /tel:([+\d][\d\s().\-]{6,20})/gi;
  while ((m = telRe.exec(html))) pushPhone(phones, m[1] ?? "", sourceUrl, sourceId);
  for (const p of extractPhones(html.replace(/<[^>]+>/g, " "), "FI")) pushPhone(phones, p, sourceUrl, sourceId);
  let website: string | null = null;
  const site = html.match(/https?:\/\/(?!www\.(?:020202|finder|fonecta|ytunnus|asiakastieto)\.)[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (site && !isDirectoryHost(site)) website = canonicalCompanyWebsite(site);
  const people = extractPeopleFromHtml(html.slice(0, 40_000), sourceUrl).slice(0, 8);
  return { emails, phones, people, website, sourceUrl, sourceId };
}

async function fetchHtml(url: string, timeoutMs = 1800): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 400_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": "fi-FI,fi;q=0.9" },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch {
    return null;
  }
}

export async function supercrawlContacts(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
}): Promise<SuperCrawlHits> {
  const name = opts.name.trim();
  if (name.length < 2) return EMPTY;
  const q = encodeURIComponent([name, opts.municipality].filter(Boolean).join(" "));
  const bid = (opts.businessId ?? "").replace(/\s/g, "");
  const urls: Array<{ url: string; id: string }> = [
    { url: `https://www.020202.fi/haku?what=${q}`, id: "020202" },
  ];
  if (/^\d{7}-\d$/.test(bid)) urls.push({ url: `https://www.ytunnus.fi/${bid}`, id: "ytunnus" });
  const pages = await Promise.all(urls.map(async (u) => {
    const html = await fetchHtml(u.url);
    return html ? parseDirectoryContactHtml(html, u.url, u.id) : EMPTY;
  }));
  const out: SuperCrawlHits = { emails: [], phones: [], people: [], website: null, sourceUrl: null, sourceId: "supercrawl" };
  for (const p of pages) {
    for (const e of p.emails) pushEmail(out.emails, e.value, p.sourceUrl ?? "", p.sourceId);
    for (const ph of p.phones) pushPhone(out.phones, ph.value, p.sourceUrl ?? "", p.sourceId);
    if (!out.website && p.website) out.website = p.website;
    if (!out.sourceUrl && p.emails.length) out.sourceUrl = p.sourceUrl;
    out.people.push(...p.people);
  }
  return out;
}
