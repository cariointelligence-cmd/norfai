import type { AdapterResult, ContactHit, ObservationInput } from "../types.ts";
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

export async function prhBisLookup(businessId: string): Promise<AdapterResult<{
  phone: string | null;
  phoneRole: string | null;
  email: string | null;
  website: string | null;
  contacts: ContactHit[];
}>> {
  const bid = normalizeBusinessId(businessId);
  if (!bid) return { ok: false, error: "Invalid business ID" };
  const url = `${BASE}/${encodeURIComponent(bid)}`;
  const r = await getJson<BisCompany | { results?: BisCompany[] }>(url, { timeoutMs: 12000 });
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
