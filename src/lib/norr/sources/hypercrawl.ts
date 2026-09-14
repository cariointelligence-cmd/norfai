/** First-party hypercrawler. Country path packs only — never mixes FI/SE/NO hosts. */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, isJunkEmail, isBillingEmail, isRecruitingEmail } from "../contacts.ts";
import { extractPeopleFromHtml } from "../extract.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { countryEnv, nationOf } from "../countries/env.ts";
import { isDirectoryHost } from "./webdiscover.ts";

export type HyperHits = {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  pages: number;
};

function originOf(website: string): string | null {
  const w = canonicalCompanyWebsite(website);
  if (!w || isDirectoryHost(w)) return null;
  try {
    const u = new URL(w);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, acceptLanguage: string): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 1800,
      maxBytes: 160_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": acceptLanguage },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch {
    return null;
  }
}

export async function hypercrawlSite(opts: {
  website?: string | null;
  country?: string | null;
  companyName?: string;
}): Promise<HyperHits> {
  const empty: HyperHits = { emails: [], phones: [], people: [], pages: 0 };
  const origin = originOf(opts.website ?? "");
  if (!origin) return empty;
  const env = countryEnv(opts.country);
  const urls = [origin, ...env.sitePaths.map((p) => origin + p)].slice(0, 8);
  const pages = await Promise.all(urls.map((u) => fetchHtml(u, env.acceptLanguage)));
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  const people: PersonHit[] = [];
  let n = 0;
  for (let i = 0; i < pages.length; i++) {
    const html = pages[i];
    const url = urls[i] ?? origin;
    if (!html) continue;
    n += 1;
    const slice = html.length > 70_000 ? html.slice(0, 70_000) : html;
    for (const e of extractEmails(slice)) {
      if (isJunkEmail(e.value) || isBillingEmail(e.value) || isRecruitingEmail(e.value)) continue;
      if (emails.some((x) => x.value === e.value)) continue;
      emails.push({
        kind: "email",
        value: e.value,
        classification: "published",
        sourceId: "hypercrawl",
        sourceUrl: url,
        evidence: `First-party ${env.nation} page`,
        confidence: 82,
      });
    }
    for (const p of extractPhones(slice.replace(/<[^>]+>/g, " ").slice(0, 16_000), env.phoneRegion)) {
      const v = normalizePhone(p) ?? p;
      if (!v || phones.some((x) => x.value === v)) continue;
      phones.push({
        kind: "phone",
        value: v,
        classification: "published",
        sourceId: "hypercrawl",
        sourceUrl: url,
        evidence: `First-party ${env.nation} page`,
        confidence: 78,
      });
    }
    people.push(...extractPeopleFromHtml(slice.slice(0, 14_000), url).slice(0, 8));
  }
  void nationOf;
  return { emails, phones, people: people.slice(0, 12), pages: n };
}
