import type { ContactHit, ObservationInput, PersonHit } from "../types.ts";
import { extractJsonLd, extractPeopleFromHtml, stripTags, plausiblePersonName, cleanPersonName } from "../extract.ts";
import { extractEmails, extractPhones, isJunkEmail, isRecruitingEmail } from "../contacts.ts";
import { canonicalCompanyWebsite, normalizeBusinessId, normalizePhone, normalizeName } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { reliability } from "./catalog.ts";
import { isDirectoryHost } from "./webdiscover.ts";
import { coreCompanyName, isDistinctiveCoreName } from "../dedupe.ts";
import { extractFinancialMentions } from "../targeting/website.ts";

const ND_ORIGIN = "https://www.northdata.com";

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = coreCompanyName(a);
  const cb = coreCompanyName(b);
  if (ca && cb && ca === cb && isDistinctiveCoreName(ca)) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export type NorthdataProfile = {
  name: string | null;
  businessId: string | null;
  lei: string | null;
  website: string | null;
  street: string | null;
  municipality: string | null;
  postalCode: string | null;
  founded: string | null;
  people: PersonHit[];
  emails: ContactHit[];
  phones: ContactHit[];
  sourceUrl: string;
  revenue: number | null;
  profit: number | null;
  financialEvidence: string[];
};

export function northdataUrls(name: string, municipality?: string | null): string[] {
  const plus = (s: string) => s.trim().replace(/\s+/g, "+");
  const n = plus(name);
  if (!n) return [];
  const out: string[] = [];
  if (municipality?.trim()) out.push(`${ND_ORIGIN}/${n},+${plus(municipality)}`);
  out.push(`${ND_ORIGIN}/${n}`);
  return out;
}

function personHit(p: { name?: string; jobTitle?: string; email?: string; telephone?: string; url?: string }, sourceUrl: string, evidence: string): PersonHit | null {
  const name = cleanPersonName(p.name);
  if (!name || !plausiblePersonName(name)) return null;
  const title = p.jobTitle ?? null;
  const email = p.email?.replace(/^mailto:/i, "").toLowerCase() ?? null;
  return {
    fullName: name,
    title,
    seniority: /ceo|toimitusjohtaja|managing director|chair|puheenjohtaja|board|signator|prokur/i.test(title ?? "") ? "executive" : "unknown",
    sourcePage: sourceUrl,
    evidence,
    confidence: 86,
    workEmail: email && !isJunkEmail(email) && !/northdata\./i.test(email) ? email : null,
    workPhone: p.telephone ? normalizePhone(p.telephone) : null,
    profileUrl: p.url ?? null,
  };
}

export function parseNorthdataHtml(html: string, sourceUrl: string): NorthdataProfile {
  const jsonLd = extractJsonLd(html);
  const org = jsonLd.orgs[0] ?? {};
  const addr = org.address && typeof org.address === "object" ? (org.address as Record<string, unknown>) : null;
  const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const text = stripTags(html);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const prh = title.match(/PRH\s+(\d{7}-\d)/i)?.[1] ?? text.match(/\b(\d{7}-\d)\b/)?.[1] ?? null;
  const leiFromLd = jsonLd.raw
    .map((n) => (n && typeof n === "object" ? (n as { leiCode?: unknown }).leiCode : null))
    .find((x): x is string => typeof x === "string" && /^[A-Z0-9]{20}$/.test(x));
  const lei = leiFromLd ?? text.match(/\b([A-Z0-9]{18}[0-9]{2})\b/)?.[1] ?? null;

  const people: PersonHit[] = [];
  const seen = new Set<string>();
  const push = (p: PersonHit | null) => {
    if (!p) return;
    const key = p.fullName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    people.push(p);
  };
  for (const p of jsonLd.persons) push(personHit(p, sourceUrl, "Northdata JSON-LD Person"));
  for (const p of extractPeopleFromHtml(html, sourceUrl)) push({ ...p, evidence: p.evidence ?? "Northdata public page", confidence: Math.min(p.confidence, 70) });

  const phones: ContactHit[] = [];
  const emails: ContactHit[] = [];
  for (const tel of extractPhones(text, "FI")) {
    const phone = normalizePhone(tel);
    if (!phone) continue;
    phones.push({
      kind: "phone",
      value: phone,
      classification: "published",
      sourceUrl,
      sourceId: "northdata",
      evidence: "Northdata public company page",
      confidence: 70,
    });
  }
  for (const e of extractEmails(html)) {
    if (isJunkEmail(e.value) || isRecruitingEmail(e.value) || /northdata\./i.test(e.value)) continue;
    emails.push({
      kind: "email",
      value: e.value,
      classification: e.classification === "obfuscated" ? "obfuscated" : "published",
      sourceUrl,
      sourceId: "northdata",
      evidence: "Northdata public page",
      confidence: 62,
    });
  }

  let website: string | null = null;
  const sameAs = (org as { sameAs?: unknown }).sameAs;
  const orgUrl = asStr(org.url);
  for (const cand of [typeof sameAs === "string" ? sameAs : null, orgUrl]) {
    if (!cand || /northdata\./i.test(cand) || isDirectoryHost(cand)) continue;
    website = canonicalCompanyWebsite(cand);
    if (website) break;
  }

  const founding = html.match(/"foundingDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null;
  const money = extractFinancialMentions(text);

  return {
    name: asStr(org.name),
    businessId: normalizeBusinessId(prh),
    lei: lei && /^[A-Z0-9]{20}$/.test(lei) ? lei : null,
    website,
    street: asStr(addr?.streetAddress),
    municipality: asStr(addr?.addressLocality),
    postalCode: asStr(addr?.postalCode),
    founded: founding,
    people,
    emails,
    phones,
    sourceUrl,
    revenue: money.revenue,
    profit: money.profit,
    financialEvidence: money.evidence,
  };
}

export async function northdataLookup(opts: {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
}): Promise<{
  ok: boolean;
  profile: NorthdataProfile | null;
  sourceUrl: string;
  observations: ObservationInput[];
}> {
  const rel = reliability("northdata");
  const empty = (url: string, evidence: string, ok = true) => ({
    ok,
    profile: null as NorthdataProfile | null,
    sourceUrl: url,
    observations: [{
      field: "northdata",
      rawValue: "not_found",
      normalisedValue: "not_found",
      confidence: 30,
      sourceReliability: rel,
      extractionMethod: "northdata_html",
      sourceUrl: url,
      verificationStatus: "not_found" as const,
      evidence,
    }],
  });
  const urls = northdataUrls(opts.name, opts.municipality);
  if (!urls.length) return empty(ND_ORIGIN, "No name for Northdata public card");

  for (const sourceUrl of urls) {
    try {
      const res = await safeFetch(sourceUrl, {
        timeoutMs: 9000,
        maxBytes: 900_000,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html",
          "Accept-Language": "en,fi;q=0.8",
        },
      });
      if (res.status >= 400 || res.body.length < 2000) continue;
      if (/<title>[^<]*Search for/i.test(res.body) && !/"@type"\s*:\s*"LocalBusiness"/i.test(res.body)) continue;
      const profile = parseNorthdataHtml(res.body, res.url || sourceUrl);
      if (!profile.name) continue;
      if (opts.name && !namesMatch(profile.name, opts.name)) continue;
      const bid = normalizeBusinessId(opts.businessId);
      if (bid && profile.businessId && profile.businessId !== bid) continue;
      const observations: ObservationInput[] = [{
        field: "northdata",
        rawValue: profile.sourceUrl,
        normalisedValue: profile.sourceUrl,
        confidence: 86,
        sourceReliability: rel,
        extractionMethod: "northdata_jsonld",
        sourceUrl: profile.sourceUrl,
        verificationStatus: "published",
        evidence: `Northdata public card for ${profile.name}`,
      }];
      if (profile.lei) {
        observations.push({
          field: "lei",
          rawValue: profile.lei,
          normalisedValue: profile.lei,
          confidence: 88,
          sourceReliability: rel,
          extractionMethod: "northdata_jsonld",
          sourceUrl: profile.sourceUrl,
          verificationStatus: "published",
          evidence: "Northdata leiCode",
        });
      }
      if (profile.phones[0]) {
        observations.push({
          field: "phone",
          rawValue: profile.phones[0].value,
          normalisedValue: profile.phones[0].value,
          confidence: 70,
          sourceReliability: rel,
          extractionMethod: "northdata_html",
          sourceUrl: profile.sourceUrl,
          verificationStatus: "published",
          evidence: "Northdata public telephone",
        });
      }
      return { ok: true, profile, sourceUrl: profile.sourceUrl, observations };
    } catch {
      continue;
    }
  }
  return empty(urls[0] ?? ND_ORIGIN, `No Northdata listing matched ${opts.name}`);
}
