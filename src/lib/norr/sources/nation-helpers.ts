/**
 * Country-isolated contact helpers. FI never calls SE/NO directories and vice versa.
 */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, isJunkEmail, isBillingEmail } from "../contacts.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { brregSearch } from "./open.ts";
import { bolagsverketSearch, parseAllabolagHtml, openCorporatesPublic } from "./homemade.ts";

export type HelperHits = {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  website: string | null;
  sourceId: string;
  businessId?: string | null;
};

const EMPTY: HelperHits = { emails: [], phones: [], people: [], website: null, sourceId: "nation-helper" };

async function html(url: string, lang: string, timeoutMs = 2500): Promise<string | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 180_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": lang },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch {
    return null;
  }
}

function takeWebsite(raw: string | null | undefined, nation: "FI" | "SE" | "NO"): string | null {
  const w = canonicalCompanyWebsite(raw ?? null);
  if (!w) return null;
  try {
    const host = new URL(w).hostname.toLowerCase();
    if (nation === "SE" && host.endsWith(".fi")) return null;
    if (nation === "NO" && host.endsWith(".fi")) return null;
    if (nation === "FI" && (host.endsWith(".se") || host.endsWith(".no")) && !host.endsWith(".fi")) return null;
  } catch { return null; }
  return w;
}

export function parseAllabolagCard(htmlBody: string, sourceUrl: string): HelperHits {
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  for (const e of extractEmails(htmlBody.slice(0, 60_000))) {
    if (isJunkEmail(e.value) || isBillingEmail(e.value) || /allabolag|hitta\.se|merinfo/i.test(e.value)) continue;
    emails.push({
      kind: "email",
      value: e.value,
      classification: "published",
      sourceId: "allabolag",
      sourceUrl,
      evidence: "Swedish Allabolag public card",
      confidence: 70,
    });
  }
  const tel = htmlBody.match(/tel:([+\d][\d\s().\-]{6,20})/i)?.[1];
  const phone = normalizePhone(tel ?? "", "SE");
  if (phone) {
    phones.push({
      kind: "phone",
      value: phone,
      classification: "published",
      sourceId: "allabolag",
      sourceUrl,
      evidence: "Swedish Allabolag public card",
      confidence: 68,
    });
  }
  const site = htmlBody.match(/https?:\/\/(?!www\.(?:allabolag|hitta|merinfo|ratsit)\.)[a-z0-9.-]+\.se\b[^"'\s]*/i)?.[0];
  return { emails, phones, people: [], website: takeWebsite(site ?? null, "SE"), sourceId: "allabolag" };
}

function coreName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(ab|as|oy|oyj|asa|kb|hf|the|group|holding)\b/g, " ")
    .replace(/[^a-z0-9åäöæø]/gi, "")
    .trim();
}

function namesAlign(query: string, hit: string): boolean {
  const q = coreName(query);
  const h = coreName(hit);
  if (q.length < 3 || h.length < 3) return false;
  if (h === q) return true;
  return h.startsWith(q) && h.length - q.length <= 3;
}

export async function swedenHelper(opts: { name: string; municipality?: string | null }): Promise<HelperHits> {
  const q = [opts.name, opts.municipality].filter(Boolean).join(" ");
  const search = await bolagsverketSearch(q);
  let first = search.ok ? search.data?.find((c) => namesAlign(opts.name, c.name ?? "")) ?? search.data?.[0] : null;
  if (!first?.businessId) {
    const oc = await openCorporatesPublic(opts.name, "se");
    first = oc.ok ? oc.data?.find((c) => namesAlign(opts.name, c.name ?? "")) ?? oc.data?.[0] : null;
    if (first?.website) return { ...EMPTY, website: takeWebsite(first.website, "SE"), sourceId: "opencorporates-se" };
    if (!first?.businessId) return { ...EMPTY, sourceId: "allabolag" };
  }
  const url = `https://www.allabolag.se/${first.businessId}`;
  const body = await html(url, "sv-SE,sv;q=0.9", 2800);
  if (!body) return { ...EMPTY, website: takeWebsite(first.website ?? null, "SE"), sourceId: "allabolag" };
  return parseAllabolagCard(body, url);
}

export async function norwayHelper(opts: { name: string; municipality?: string | null }): Promise<HelperHits> {
  const search = await brregSearch(opts.name);
  if (!search.ok || !search.data?.length) return { ...EMPTY, sourceId: "brreg" };
  const hit = search.data.find((c) => namesAlign(opts.name, c.name ?? "") && c.website)
    ?? search.data.find((c) => namesAlign(opts.name, c.name ?? ""))
    ?? null;
  const website = takeWebsite(hit?.website ?? null, "NO");
  return { emails: [], phones: [], people: [], website, sourceId: "brreg", businessId: hit?.businessId ?? null };
}

void parseAllabolagHtml;
