import type { AdapterResult, ContactHit, DiscoveredCompany, ObservationInput } from "../types.ts";
import { getJson } from "../http.ts";
import { normalizeBusinessId, normalizePhone, normalizeWebsite } from "../normalize.ts";
import { classifyPhoneRole } from "../phones.ts";
import { reliability } from "./catalog.ts";
import { isJunkEmail } from "../contacts.ts";

const BASE = "https://avoindata.prh.fi/bis/v1";

type BisContact = { type?: string; value?: string };
type BisAddr = { street?: string; postCode?: string; postOffice?: string; city?: string };
type BisCompany = {
  businessId?: string;
  name?: string;
  registrationDate?: string;
  companyForm?: string;
  detailsUri?: string;
  contactDetails?: BisContact[];
  addresses?: BisAddr[];
  businessLines?: Array<{ code?: string; name?: string }>;
};

function typeOf(t: string): "phone" | "email" | "website" | "other" {
  const s = t.toLowerCase();
  if (/puhelin|telephone|phone|mobile|gsm|matkapuhelin/.test(s)) return "phone";
  if (/sähköposti|sahkoposti|email|e-mail/.test(s)) return "email";
  if (/www|web|kotisivu|website/.test(s)) return "website";
  return "other";
}

export async function prhBisLookup(businessId: string, opts?: { timeoutMs?: number }): Promise<AdapterResult<{
  phone: string | null;
  phoneRole: string | null;
  email: string | null;
  website: string | null;
  contacts: ContactHit[];
}>> {
  const bid = normalizeBusinessId(businessId);
  if (!bid) return { ok: false, error: "Invalid business ID" };
  const url = `${BASE}/${encodeURIComponent(bid)}`;
  const r = await getJson<BisCompany | { results?: BisCompany[] }>(url, { timeoutMs: opts?.timeoutMs ?? 4000 });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const raw = r.data as BisCompany & { results?: BisCompany[] };
  const c = raw.results?.[0] ?? raw;
  const contacts: ContactHit[] = [];
  const observations: ObservationInput[] = [];
  let phone: string | null = null;
  let phoneRole: string | null = null;
  let email: string | null = null;
  let website: string | null = null;
  const rel = reliability("ytj");
  for (const d of c.contactDetails ?? []) {
    const kind = typeOf(String(d.type ?? ""));
    const value = String(d.value ?? "").trim();
    if (!value) continue;
    if (kind === "phone") {
      const n = normalizePhone(value);
      if (!n) continue;
      const role = classifyPhoneRole(n, d.type ?? "");
      if (!phone) {
        phone = n;
        phoneRole = role;
      }
      contacts.push({
        kind: "phone",
        value: n,
        classification: "published",
        evidence: `PRH BIS ${d.type ?? "phone"}`,
        sourceUrl: url,
        sourceId: "ytj",
        confidence: 90,
      });
      observations.push({
        field: "phone",
        rawValue: value,
        normalisedValue: n,
        confidence: 90,
        sourceReliability: rel,
        extractionMethod: "prh_bis",
        sourceUrl: url,
        licence: "PRH open data",
        verificationStatus: "published",
        evidence: d.type ?? "BIS contactDetails",
      });
    } else if (kind === "email") {
      const e = value.toLowerCase().replace(/^mailto:/, "");
      if (isJunkEmail(e)) continue;
      if (!email) email = e;
      contacts.push({
        kind: "email",
        value: e,
        classification: "published",
        evidence: "PRH BIS email",
        sourceUrl: url,
        sourceId: "ytj",
        confidence: 90,
      });
      observations.push({
        field: "general_email",
        rawValue: e,
        normalisedValue: e,
        confidence: 90,
        sourceReliability: rel,
        extractionMethod: "prh_bis",
        sourceUrl: url,
        licence: "PRH open data",
        verificationStatus: "published",
      });
    } else if (kind === "website") {
      const w = normalizeWebsite(value);
      if (w && !website) website = w;
      if (w) {
        observations.push({
          field: "website",
          rawValue: value,
          normalisedValue: w,
          confidence: 88,
          sourceReliability: rel,
          extractionMethod: "prh_bis",
          sourceUrl: url,
          licence: "PRH open data",
          verificationStatus: "published",
        });
      }
    }
  }
  return {
    ok: true,
    data: { phone, phoneRole, email, website, contacts },
    observations,
    sourceUrl: url,
  };
}

function bisToDiscovered(c: BisCompany): DiscoveredCompany | null {
  const name = String(c.name ?? "").trim();
  const bid = normalizeBusinessId(c.businessId);
  if (!name || name.length < 2) return null;
  const addr = c.addresses?.[0];
  const line = c.businessLines?.[0];
  let website: string | null = null;
  for (const d of c.contactDetails ?? []) {
    if (typeOf(String(d.type ?? "")) === "website") {
      website = normalizeWebsite(d.value ?? "") ?? website;
    }
  }
  return {
    name,
    businessId: bid,
    country: "FI",
    legalForm: c.companyForm ?? null,
    registrationDate: c.registrationDate ?? null,
    industryCode: line?.code ?? null,
    industryLabel: line?.name ?? null,
    street: addr?.street ?? null,
    postalCode: addr?.postCode ?? null,
    municipality: addr?.city || addr?.postOffice || null,
    website,
  };
}

/** Official PRH BIS list search. Complements YTJ v3 — same register, different index. */
export async function prhBisSearch(opts: {
  name?: string | null;
  municipality?: string | null;
  businessLine?: string | null;
  max?: number;
  timeoutMs?: number;
}): Promise<AdapterResult<DiscoveredCompany[]>> {
  const max = Math.min(100, Math.max(1, opts.max ?? 40));
  const params = new URLSearchParams({
    totalResults: "false",
    maxResults: String(max),
    resultsFrom: "0",
  });
  const name = String(opts.name ?? "").trim().slice(0, 80);
  const office = String(opts.municipality ?? "").trim().slice(0, 40);
  const line = String(opts.businessLine ?? "").replace(/\D/g, "").slice(0, 5);
  if (name.length >= 3) params.set("name", name);
  if (office.length >= 2) params.set("registeredOffice", office);
  if (line.length >= 2) params.set("businessLine", line);
  if (!params.has("name") && !params.has("registeredOffice") && !params.has("businessLine")) {
    return { ok: true, data: [] };
  }
  const url = `${BASE}?${params.toString()}`;
  const r = await getJson<{ results?: BisCompany[] }>(url, { timeoutMs: opts.timeoutMs ?? 3500 });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const raw of r.data?.results ?? []) {
    const row = bisToDiscovered(raw);
    if (!row) continue;
    const key = row.businessId || row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { ok: true, data: out, sourceUrl: url };
}
