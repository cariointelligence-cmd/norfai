import type { ContactHit, ObservationInput, PersonHit } from "../types.ts";
import { extractJsonLd, extractPeopleFromHtml, stripTags, plausiblePersonName, cleanPersonName } from "../extract.ts";
import { extractEmails, extractPhones, isJunkEmail, isRecruitingEmail } from "../contacts.ts";
import { canonicalCompanyWebsite, normalizeBusinessId, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { reliability } from "./catalog.ts";
import { isDirectoryHost } from "./webdiscover.ts";
import { extractFinancialMentions } from "../targeting/website.ts";

const KL_ORIGIN = "https://www.kauppalehti.fi";

export type KauppalehtiProfile = {
  name: string | null;
  businessId: string | null;
  website: string | null;
  street: string | null;
  municipality: string | null;
  postalCode: string | null;
  people: PersonHit[];
  emails: ContactHit[];
  phones: ContactHit[];
  sourceUrl: string;
  revenue: number | null;
  profit: number | null;
  financialEvidence: string[];
};

export function kauppalehtiUrl(businessId: string): string {
  const digits = businessId.replace(/\D/g, "");
  return `${KL_ORIGIN}/yritykset/yritys/${digits}`;
}

function asText(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object") {
    const rec = v as Record<string, unknown>;
    if (typeof rec.name === "string") return rec.name;
    if (typeof rec.telephone === "string") return rec.telephone;
    if (typeof rec.email === "string") return rec.email;
  }
  return null;
}

function peopleFromLd(raw: unknown, sourceUrl: string): PersonHit[] {
  const nodes = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: PersonHit[] = [];
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    const rec = n as Record<string, unknown>;
    const name = cleanPersonName(asText(rec.name));
    if (!name || !plausiblePersonName(name)) continue;
    const title = asText(rec.jobTitle);
    const email = asText(rec.email)?.replace(/^mailto:/i, "").toLowerCase() ?? null;
    out.push({
      fullName: name,
      title,
      seniority: /ceo|toimitusjohtaja|johtaja|director|chair/i.test(title ?? "") ? "executive" : "unknown",
      sourcePage: sourceUrl,
      evidence: "Kauppalehti JSON-LD Person",
      confidence: 84,
      workEmail: email && !isJunkEmail(email) ? email : null,
      workPhone: asText(rec.telephone) ? normalizePhone(String(asText(rec.telephone))) : null,
    });
  }
  return out;
}

export function parseKauppalehtiHtml(html: string, sourceUrl: string): KauppalehtiProfile {
  const jsonLd = extractJsonLd(html);
  const org = jsonLd.orgs[0] ?? {};
  const addr = org.address && typeof org.address === "object" ? (org.address as Record<string, unknown>) : null;
  const street = asText(addr?.streetAddress);
  const municipality = asText(addr?.addressLocality);
  const postalCode = asText(addr?.postalCode);
  const text = stripTags(html);
  const bid = normalizeBusinessId(asText((org as { vatID?: string }).vatID) ?? text.match(/\b(\d{7}-\d)\b/)?.[1] ?? null);

  const phones: ContactHit[] = [];
  const emails: ContactHit[] = [];
  const tel = asText((org as { telephone?: string }).telephone)
    ?? asText((org as { contactPoint?: { telephone?: string } }).contactPoint?.telephone)
    ?? extractPhones(text, "FI")[0];
  const phone = tel ? normalizePhone(tel) : null;
  if (phone) {
    phones.push({
      kind: "phone",
      value: phone,
      classification: "published",
      sourceUrl,
      sourceId: "kauppalehti",
      evidence: "Kauppalehti company card",
      confidence: 86,
    });
  }

  for (const e of extractEmails(html)) {
    if (isJunkEmail(e.value) || isRecruitingEmail(e.value)) continue;
    if (/almamedia\.fi|kauppalehti\.fi/i.test(e.value)) continue;
    emails.push({
      kind: "email",
      value: e.value,
      classification: e.classification === "obfuscated" ? "obfuscated" : "published",
      sourceUrl,
      sourceId: "kauppalehti",
      evidence: "Kauppalehti public page",
      confidence: 70,
    });
  }

  const peopleRaw = [
    ...peopleFromLd(jsonLd.persons, sourceUrl),
    ...extractPeopleFromHtml(html, sourceUrl),
  ].filter((p) => plausiblePersonName(p.fullName));
  const people: PersonHit[] = [];
  const seenPeople = new Set<string>();
  for (const p of peopleRaw) {
    const key = p.fullName.toLowerCase();
    if (seenPeople.has(key)) continue;
    seenPeople.add(key);
    people.push(p);
  }

  let website: string | null = null;
  const sameAs = (org as { sameAs?: unknown }).sameAs;
  if (typeof sameAs === "string") website = canonicalCompanyWebsite(sameAs);
  const orgUrl = asText(org.url);
  if (!website && orgUrl && !/kauppalehti\.fi/i.test(orgUrl) && !isDirectoryHost(orgUrl)) {
    website = canonicalCompanyWebsite(orgUrl);
  }
  if (!website) {
    const ext = html.match(/https?:\/\/(?:www\.)?(?![a-z0-9.-]*(?:kauppalehti|almamedia|almatalent|facebook|linkedin|twitter|instagram))[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    for (const u of ext) {
      if (isDirectoryHost(u)) continue;
      website = canonicalCompanyWebsite(u);
      if (website) break;
    }
  }

  const money = extractFinancialMentions(text);

  return {
    name: asText(org.name),
    businessId: bid,
    website,
    street,
    municipality,
    postalCode,
    people,
    emails,
    phones,
    sourceUrl,
    revenue: money.revenue,
    profit: money.profit,
    financialEvidence: money.evidence,
  };
}

export async function kauppalehtiLookup(opts: {
  name: string;
  businessId?: string | null;
}): Promise<{
  ok: boolean;
  profile: KauppalehtiProfile | null;
  sourceUrl: string;
  observations: ObservationInput[];
}> {
  const rel = reliability("kauppalehti");
  const bid = opts.businessId ? normalizeBusinessId(opts.businessId) : null;
  if (!bid) {
    return {
      ok: true,
      profile: null,
      sourceUrl: KL_ORIGIN,
      observations: [{
        field: "kauppalehti",
        rawValue: "skipped",
        normalisedValue: "skipped",
        confidence: 20,
        sourceReliability: rel,
        extractionMethod: "kauppalehti_html",
        verificationStatus: "not_found",
        evidence: "No Y-tunnus for Kauppalehti public card",
      }],
    };
  }
  const sourceUrl = kauppalehtiUrl(bid);
  try {
    const res = await safeFetch(sourceUrl, {
      timeoutMs: 9000,
      maxBytes: 1_400_000,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html",
        "Accept-Language": "fi-FI,fi;q=0.9",
      },
    });
    if (res.status >= 400 || res.body.length < 800) {
      return {
        ok: false,
        profile: null,
        sourceUrl,
        observations: [{
          field: "kauppalehti",
          rawValue: "not_found",
          normalisedValue: "not_found",
          confidence: 30,
          sourceReliability: rel,
          extractionMethod: "kauppalehti_html",
          sourceUrl,
          verificationStatus: "not_found",
          evidence: `Kauppalehti HTTP ${res.status}`,
        }],
      };
    }
    const profile = parseKauppalehtiHtml(res.body, res.url || sourceUrl);
    const observations: ObservationInput[] = [{
      field: "kauppalehti",
      rawValue: profile.sourceUrl,
      normalisedValue: profile.sourceUrl,
      confidence: 86,
      sourceReliability: rel,
      extractionMethod: "kauppalehti_html",
      sourceUrl: profile.sourceUrl,
      verificationStatus: "published",
      evidence: `Kauppalehti public company card for ${profile.name ?? opts.name}`,
    }];
    if (profile.phones[0]) {
      observations.push({
        field: "phone",
        rawValue: profile.phones[0].value,
        normalisedValue: profile.phones[0].value,
        confidence: 86,
        sourceReliability: rel,
        extractionMethod: "kauppalehti_jsonld",
        sourceUrl: profile.sourceUrl,
        verificationStatus: "published",
        evidence: "Kauppalehti JSON-LD telephone",
      });
    }
    if (profile.website) {
      observations.push({
        field: "website",
        rawValue: profile.website,
        normalisedValue: profile.website,
        confidence: 72,
        sourceReliability: rel,
        extractionMethod: "kauppalehti_html",
        sourceUrl: profile.sourceUrl,
        verificationStatus: "published",
        evidence: "Kauppalehti public company website",
      });
    }
    return { ok: true, profile, sourceUrl: profile.sourceUrl, observations };
  } catch (err) {
    return {
      ok: false,
      profile: null,
      sourceUrl,
      observations: [{
        field: "kauppalehti",
        rawValue: "error",
        normalisedValue: "error",
        confidence: 20,
        sourceReliability: rel,
        extractionMethod: "kauppalehti_html",
        sourceUrl,
        verificationStatus: "not_found",
        evidence: err instanceof Error ? err.message : "Kauppalehti fetch failed",
      }],
    };
  }
}
