import dns from "node:dns/promises";
import type { AdapterResult, DiscoveredCompany, ObservationInput, PersonHit, SignalHit, ContactHit } from "../types.ts";
import { getJson, postJson } from "../http.ts";
import { FETCH_UA } from "../ssrf.ts";
import { normalizeBusinessId, normalizeName, normalizePhone, normalizeWebsite, fromVatId } from "../normalize.ts";
import { reliability } from "./catalog.ts";
import { extractEmails, extractPhones, isJunkEmail } from "../contacts.ts";

type WdClaims = Record<string, Array<{ mainsnak?: { datavalue?: { type?: string; value?: unknown } } }>>;

function claimValues(claims: WdClaims | undefined, pid: string): unknown[] {
  const out: unknown[] = [];
  for (const c of claims?.[pid] ?? []) {
    const dv = c.mainsnak?.datavalue;
    if (!dv) continue;
    out.push(dv.value);
  }
  return out;
}

function claimStrings(claims: WdClaims | undefined, pid: string): string[] {
  return claimValues(claims, pid).flatMap((v) => {
    if (typeof v === "string") return [v];
    if (v && typeof v === "object") {
      const rec = v as { id?: string; text?: string; amount?: string };
      if (rec.id) return [rec.id];
      if (rec.text) return [rec.text];
      if (rec.amount) return [rec.amount.replace(/^\+/, "")];
    }
    return [];
  });
}

function looksLikeOrg(label: string, description?: string): boolean {
  const blob = `${label} ${description ?? ""}`.toLowerCase();
  if (/\b(film|album|song|human|footballer|species|village|given name|surname|musician)\b/i.test(blob)) return false;
  if (/\b(company|yritys|corporation|osakeyhtiö|construction|rakennus|firm|group|oyj|business|enterprise)\b/i.test(blob)) return true;
  return !description;
}

async function fetchEntity(qid: string): Promise<{
  qid: string;
  labels: Record<string, { value?: string }>;
  claims: WdClaims;
  sitelinks: Record<string, { title?: string }>;
} | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=claims|labels|sitelinks&languages=fi|en|sv&format=json`;
  const r = await getJson<{
    entities?: Record<string, { labels?: Record<string, { value?: string }>; claims?: WdClaims; sitelinks?: Record<string, { title?: string }> }>;
  }>(url, { headers: { "User-Agent": FETCH_UA }, timeoutMs: 12000 });
  if (!r.ok) return null;
  const ent = r.data.entities?.[qid];
  if (!ent) return null;
  return { qid, labels: ent.labels ?? {}, claims: ent.claims ?? {}, sitelinks: ent.sitelinks ?? {} };
}

async function entityLabel(qid: string): Promise<string | null> {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=labels&languages=fi|en|sv&format=json`;
  const r = await getJson<{ entities?: Record<string, { labels?: Record<string, { value?: string }> }> }>(url, {
    headers: { "User-Agent": FETCH_UA },
    timeoutMs: 8000,
  });
  if (!r.ok) return null;
  const labels = r.data.entities?.[qid]?.labels ?? {};
  return labels.fi?.value ?? labels.en?.value ?? labels.sv?.value ?? null;
}

export async function wikidataLookup(name: string, businessId?: string | null): Promise<AdapterResult<{
  qid?: string;
  website?: string | null;
  lei?: string | null;
  ceo?: string | null;
  chair?: string | null;
  inception?: string | null;
  employees?: number | null;
  revenue?: number | null;
  profit?: number | null;
  phone?: string | null;
  email?: string | null;
  people: PersonHit[];
  parentName?: string | null;
}>> {
  const bid = businessId ? normalizeBusinessId(businessId) : null;
  let qid: string | undefined;

  if (bid) {
    const q = `SELECT ?item WHERE { ?item wdt:P3228 "${bid}". } LIMIT 1`;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
    const r = await getJson<{ results?: { bindings?: Array<Record<string, { value?: string }>> } }>(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": FETCH_UA },
      timeoutMs: 12000,
    });
    if (r.ok) qid = r.data.results?.bindings?.[0]?.item?.value?.split("/").pop();
  }

  if (!qid) {
    const queries = [name, normalizeName(name), normalizeName(name).split(" ").slice(0, 2).join(" ")].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i);
    for (const q of queries) {
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=fi&uselang=fi&type=item&limit=5&format=json`;
      const r = await getJson<{ search?: Array<{ id?: string; label?: string; description?: string }> }>(url, {
        headers: { "User-Agent": FETCH_UA },
        timeoutMs: 10000,
      });
      if (!r.ok) continue;
      const hit = (r.data.search ?? []).find((s) => s.id && looksLikeOrg(s.label ?? "", s.description));
      if (hit?.id) {
        qid = hit.id;
        break;
      }
    }
  }

  if (!qid) return { ok: false, error: "No Wikidata match", state: "connected" };
  const ent = await fetchEntity(qid);
  if (!ent) return { ok: false, error: "Wikidata entity fetch failed", state: "temporarily_unavailable" };

  const website = normalizeWebsite(claimStrings(ent.claims, "P856")[0] ?? null);
  const lei = claimStrings(ent.claims, "P1278")[0] ?? null;
  const ceoQid = claimStrings(ent.claims, "P169")[0] ?? null;
  const ceo = ceoQid && /^Q\d+$/.test(ceoQid) ? await entityLabel(ceoQid) : ceoQid;
  const chairQid = claimStrings(ent.claims, "P488")[0] ?? null;
  const chair = chairQid && /^Q\d+$/.test(chairQid) ? await entityLabel(chairQid) : chairQid && !/^Q\d+$/.test(chairQid) ? chairQid : null;
  const inception = claimStrings(ent.claims, "P571")[0]?.slice(0, 10) ?? null;
  const empRaw = claimStrings(ent.claims, "P1128")[0];
  const employees = empRaw ? Number(empRaw) : null;
  const revenueRaw = claimStrings(ent.claims, "P2139")[0];
  const revenue = revenueRaw ? Number(String(revenueRaw).replace(/[^\d.]/g, "")) : null;
  const profitRaw = claimStrings(ent.claims, "P2295")[0];
  const profit = profitRaw ? Number(String(profitRaw).replace(/[^\d.-]/g, "")) : null;
  const phoneRaw = claimStrings(ent.claims, "P1329")[0] ?? null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const emailRaw = (claimStrings(ent.claims, "P968")[0] ?? "").replace(/^mailto:/i, "");
  const email = emailRaw && !isJunkEmail(emailRaw) ? emailRaw.toLowerCase() : null;
  const parentQid = claimStrings(ent.claims, "P749")[0] ?? null;
  const parentName = parentQid && /^Q\d+$/.test(parentQid) ? await entityLabel(parentQid) : null;

  const sourceUrl = `https://www.wikidata.org/wiki/${qid}`;
  const people: PersonHit[] = [];
  const ceoPerson = wikidataPerson(ceo ?? null, sourceUrl);
  if (ceoPerson) people.push(ceoPerson);
  if (chair) {
    people.push({
      fullName: chair,
      title: "Chairperson",
      seniority: "executive",
      sourcePage: sourceUrl,
      evidence: "Wikidata P488 (chairperson). Corroborate against a company-controlled page",
      confidence: 55,
    });
  }
  const data = {
    qid,
    website,
    lei,
    ceo,
    chair,
    inception,
    employees: employees != null && Number.isFinite(employees) ? employees : null,
    revenue: revenue != null && Number.isFinite(revenue) && revenue > 0 ? revenue : null,
    profit: profit != null && Number.isFinite(profit) ? profit : null,
    phone,
    email,
    people,
    parentName,
  };
  const observations: ObservationInput[] = [];
  const push = (field: string, raw: string | null | undefined, extra?: Partial<ObservationInput>) => {
    if (!raw) return;
    observations.push({
      field,
      rawValue: raw,
      normalisedValue: raw,
      confidence: 58,
      sourceReliability: reliability("wikidata"),
      extractionMethod: "wbgetentities",
      sourceUrl,
      licence: "CC0",
      verificationStatus: "unverified",
      evidence: "Wikidata is supporting entity resolution, not a primary contact source",
      ...extra,
    });
  };
  push("website", data.website);
  push("lei", data.lei);
  push("employee_count", data.employees != null ? String(data.employees) : null);
  push("revenue", data.revenue != null ? String(data.revenue) : null, { verificationStatus: "unverified", evidence: "Wikidata P2139" });
  push("profit", data.profit != null ? String(data.profit) : null, { verificationStatus: "unverified", evidence: "Wikidata P2295" });
  push("registration_date", data.inception);
  push("phone", data.phone, { verificationStatus: "unverified" });
  push("email", data.email, { verificationStatus: "unverified" });
  push("parent_name", data.parentName, { evidence: "Wikidata P749 parent organization" });
  return { ok: true, data, observations, sourceUrl };
}

export function wikidataPerson(ceo: string | null, sourceUrl?: string): PersonHit | null {
  if (!ceo) return null;
  return {
    fullName: ceo,
    title: "Chief executive officer",
    seniority: "executive",
    sourcePage: sourceUrl ?? "https://www.wikidata.org/",
    evidence: "Wikidata P169 (chief executive officer). Corroborate against a company-controlled page",
    confidence: 55,
  };
}

export async function gleifLookup(name: string, country = "FI"): Promise<AdapterResult<{ lei: string; legalName: string; status?: string; address?: string }>> {
  const url = `https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&filter[entity.legalAddress.country]=${encodeURIComponent(country)}&page[size]=1`;
  const r = await getJson<{
    data?: Array<{
      id?: string;
      attributes?: {
        lei?: string;
        entity?: {
          legalName?: { name?: string };
          legalAddress?: { addressLines?: string[]; city?: string; country?: string };
          status?: string;
        };
      };
    }>;
  }>(url, { headers: { Accept: "application/vnd.api+json" } });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const rec = r.data.data?.[0];
  const lei = rec?.attributes?.lei ?? rec?.id;
  if (!lei) return { ok: false, error: "No LEI record", state: "connected" };
  const legalName = rec?.attributes?.entity?.legalName?.name ?? name;
  const addr = rec?.attributes?.entity?.legalAddress;
  const address = addr ? [...(addr.addressLines ?? []), addr.city, addr.country].filter(Boolean).join(", ") : undefined;
  const observations: ObservationInput[] = [
    {
      field: "lei",
      rawValue: lei,
      normalisedValue: lei,
      confidence: 88,
      sourceReliability: reliability("gleif"),
      extractionMethod: "gleif_json",
      sourceUrl: `https://search.gleif.org/#/record/${lei}`,
      licence: "GLEIF Golden Copy",
      verificationStatus: "published",
    },
  ];
  return {
    ok: true,
    data: { lei, legalName, status: rec?.attributes?.entity?.status, address },
    observations,
    sourceUrl: `https://search.gleif.org/#/record/${lei}`,
  };
}

export async function gleifDirectParent(lei: string): Promise<AdapterResult<{ parentLei: string; parentName: string | null }>> {
  const url = `https://api.gleif.org/api/v1/lei-records/${encodeURIComponent(lei)}/direct-parent`;
  const r = await getJson<{
    data?: {
      id?: string;
      attributes?: { lei?: string; entity?: { legalName?: { name?: string } } };
    };
  }>(url, { headers: { Accept: "application/vnd.api+json" }, timeoutMs: 10000 });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 404 ? "connected" : "temporarily_unavailable" };
  const parentLei = r.data.data?.attributes?.lei ?? r.data.data?.id;
  if (!parentLei) return { ok: false, error: "No parent LEI", state: "connected" };
  const parentName = r.data.data?.attributes?.entity?.legalName?.name ?? null;
  return {
    ok: true,
    data: { parentLei, parentName },
    observations: [{
      field: "parent_name",
      rawValue: parentName ?? parentLei,
      normalisedValue: parentName ?? parentLei,
      confidence: 86,
      sourceReliability: reliability("gleif"),
      extractionMethod: "gleif_direct_parent",
      sourceUrl: url,
      licence: "GLEIF Golden Copy",
      verificationStatus: "published",
      evidence: `Direct parent LEI ${parentLei}`,
    }],
    sourceUrl: url,
  };
}

export async function viesValidate(vatId: string): Promise<AdapterResult<{ valid: boolean; name?: string | null; address?: string | null }>> {
  const m = vatId.toUpperCase().replace(/\s/g, "").match(/^([A-Z]{2})(.+)$/);
  if (!m) return { ok: false, error: "VAT ID must start with a country code" };
  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${m[1]}/vat/${m[2]}`;
  const r = await getJson<{ isValid?: boolean; name?: string; address?: string }>(url);
  if (!r.ok) return { ok: false, error: r.error, state: "temporarily_unavailable" };
  const observations: ObservationInput[] = [
    {
      field: "vat_valid",
      rawValue: String(Boolean(r.data.isValid)),
      normalisedValue: r.data.isValid ? "valid" : "invalid",
      confidence: 90,
      sourceReliability: reliability("vies"),
      extractionMethod: "vies_rest",
      sourceUrl: "https://ec.europa.eu/taxation_customs/vies/",
      licence: "European Commission VIES",
      verificationStatus: r.data.isValid ? "verified" : "failed",
      evidence: r.data.name ? `VIES registered name: ${r.data.name}` : null,
    },
  ];
  return {
    ok: true,
    data: { valid: Boolean(r.data.isValid), name: r.data.name ?? null, address: r.data.address ?? null },
    observations,
    sourceUrl: url,
  };
}

export async function tedSearch(name: string): Promise<AdapterResult<SignalHit[]> & { contacts?: ContactHit[] }> {
  const body = {
    limit: 5,
    paginationMode: "PAGE_NUMBER",
    page: 1,
    scope: "ACTIVE",
    fields: ["publication-number", "notice-title", "buyer-name", "publication-date", "buyer-email", "buyer-phone"],
    query: `buyer-name=${JSON.stringify(name)}`,
  };
  const r = await postJson<{ notices?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> }>(
    "https://api.ted.europa.eu/v3/notices/search",
    body,
    { timeoutMs: 15000 },
  );
  if (!r.ok) {
    const alt = await getJson<unknown>(
      `https://api.ted.europa.eu/v3/notices/search?q=${encodeURIComponent(name)}&limit=3`,
      { timeoutMs: 12000 },
    );
    if (!alt.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  }
  if (!r.ok) return { ok: false, error: r.error };
  const rows = r.data.notices ?? r.data.results ?? [];
  const contacts: ContactHit[] = [];
  const hits: SignalHit[] = rows.slice(0, 5).map((n, i) => {
    const blob = JSON.stringify(n);
    const sourceUrl = "https://ted.europa.eu/";
    for (const e of extractEmails(blob)) {
      contacts.push({
        kind: "email",
        value: e.value,
        classification: e.classification === "obfuscated" ? "obfuscated" : "published",
        sourceUrl,
        evidence: "TED notice JSON",
        confidence: 62,
      });
    }
    for (const p of extractPhones(blob, "FI")) {
      contacts.push({
        kind: "phone",
        value: p,
        classification: "published",
        sourceUrl,
        evidence: "TED notice JSON",
        confidence: 60,
      });
    }
    return {
      kind: "procurement",
      title: String((n as { "notice-title"?: string; title?: string }).title ?? (n as { "notice-title"?: string })["notice-title"] ?? `TED notice ${i + 1}`),
      detail: blob.slice(0, 400),
      sourceUrl,
      confidence: 70,
      evidence: "TED API search by buyer name",
    };
  });
  return { ok: true, data: hits, observations: [], sourceUrl: "https://ted.europa.eu/", contacts };
}

export async function hilmaSearch(name: string): Promise<AdapterResult<SignalHit[]>> {
  const url = `https://www.hankintailmoitukset.fi/s/api/public/notice/search?search=${encodeURIComponent(name)}&lang=fi`;
  const r = await getJson<{ notices?: Array<{ title?: string; id?: string; published?: string }>; content?: Array<{ title?: string; id?: string }> }>(url, {
    timeoutMs: 12000,
  });
  if (!r.ok) {
    return { ok: false, error: r.error, state: r.status === 404 ? "temporarily_unavailable" : r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  }
  const rows = r.data.notices ?? r.data.content ?? [];
  const hits: SignalHit[] = rows.slice(0, 5).map((n) => ({
    kind: "procurement",
    title: n.title ?? "Hilma notice",
    sourceUrl: n.id ? `https://www.hankintailmoitukset.fi/fi/notice/${n.id}` : "https://www.hankintailmoitukset.fi/",
    confidence: 68,
    evidence: "Hilma public search API",
  }));
  return { ok: true, data: hits, observations: [], sourceUrl: url };
}

export async function brregSearch(name: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const q = name.trim();
  if (q.length < 2) return { ok: false, error: "Query too short" };
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(q)}&size=10`;
  const r = await getJson<{ _embedded?: { enheter?: BrregEnhet[] } }>(url);
  if (!r.ok) return { ok: false, error: r.error };
  const data = (r.data._embedded?.enheter ?? []).map(mapBrregEnhet).filter((row): row is DiscoveredCompany => Boolean(row));
  return { ok: true, data, observations: [], sourceUrl: url };
}

type BrregEnhet = {
  organisasjonsnummer?: string;
  navn?: string;
  organisasjonsform?: { beskrivelse?: string; kode?: string };
  forretningsadresse?: { adresse?: string[]; postnummer?: string; poststed?: string };
  hjemmeside?: string;
  naeringskode1?: { kode?: string; kuvaus?: string; beskrivelse?: string };
  konkurs?: boolean;
  underAvvikling?: boolean;
};

function mapBrregEnhet(e: BrregEnhet): DiscoveredCompany | null {
  const name = (e.navn ?? "").trim();
  if (!name || /^unknown$/i.test(name)) return null;
  return {
    businessId: e.organisasjonsnummer ?? null,
    name,
    country: "NO",
    legalForm: e.organisasjonsform?.beskrivelse ?? null,
    legalFormCode: e.organisasjonsform?.kode ?? null,
    street: e.forretningsadresse?.adresse?.join(" ") ?? null,
    postalCode: e.forretningsadresse?.postnummer ?? null,
    municipality: e.forretningsadresse?.poststed ?? null,
    website: normalizeWebsite(e.hjemmeside ?? null),
    industryCode: e.naeringskode1?.kode ?? null,
    industryLabel: e.naeringskode1?.beskrivelse ?? null,
    businessStatus: e.konkurs || e.underAvvikling ? "dissolved" : "active",
  };
}

/** NACE search against Brønnøysund. Municipality is a client-side poststed filter. */
export async function brregIndustrySearch(nace: string, municipality?: string | null): Promise<AdapterResult<DiscoveredCompany[]>> {
  const code = nace.trim();
  if (code.length < 2) return { ok: false, error: "No NACE code" };
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${encodeURIComponent(code)}&size=20&konkurs=false`;
  const r = await getJson<{ _embedded?: { enheter?: BrregEnhet[] } }>(url);
  if (!r.ok) return { ok: false, error: r.error };
  let data = (r.data._embedded?.enheter ?? []).map(mapBrregEnhet).filter((row): row is DiscoveredCompany => Boolean(row));
  const want = (municipality ?? "").trim().toLowerCase();
  if (want) data = data.filter((row) => (row.municipality ?? "").toLowerCase().includes(want));
  return { ok: true, data, observations: [], sourceUrl: url };
}

export async function brregFetchById(orgnr: string): Promise<AdapterResult<DiscoveredCompany> & { sourceUrl?: string }> {
  const id = String(orgnr).replace(/\D/g, "");
  if (id.length < 9) return { ok: false, error: "Invalid organisation number" };
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(id)}`;
  const r = await getJson<BrregEnhet>(url);
  if (!r.ok) return { ok: false, error: r.error };
  const row = mapBrregEnhet(r.data);
  if (!row) return { ok: false, error: "Not found" };
  return { ok: true, data: row, observations: [], sourceUrl: url };
}

export async function cvrSearch(name: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const url = `https://cvrapi.dk/api?search=${encodeURIComponent(name)}&country=dk`;
  const r = await getJson<CvrRecord>(url, { headers: { "User-Agent": "NorfIntel/1.0 (research@norf.local)" } });
  if (!r.ok) return { ok: false, error: r.error };
  const row = mapCvr(r.data);
  if (!row) return { ok: false, error: r.data.error ?? "No CVR match", state: "connected" };
  return { ok: true, data: [row], observations: [], sourceUrl: url };
}

type CvrRecord = {
  vat?: number;
  name?: string;
  address?: string;
  zipcode?: number;
  city?: string;
  industrydesc?: string;
  industrycode?: number | string;
  error?: string;
};

function mapCvr(r: CvrRecord): DiscoveredCompany | null {
  if (r.error || !r.name) return null;
  return {
    vatId: r.vat ? `DK${r.vat}` : null,
    businessId: r.vat ? String(r.vat) : null,
    name: r.name,
    country: "DK",
    street: r.address ?? null,
    postalCode: r.zipcode ? String(r.zipcode) : null,
    municipality: r.city ?? null,
    industryCode: r.industrycode != null ? String(r.industrycode) : null,
    industryLabel: r.industrydesc ?? null,
  };
}

export async function cvrFetchByVat(vat: string): Promise<AdapterResult<DiscoveredCompany> & { sourceUrl?: string }> {
  const digits = String(vat).replace(/\D/g, "");
  if (digits.length < 8) return { ok: false, error: "Invalid VAT" };
  const url = `https://cvrapi.dk/api?vat=${encodeURIComponent(digits)}&country=dk`;
  const r = await getJson<CvrRecord>(url, { headers: { "User-Agent": "NorfIntel/1.0 (research@norf.local)" } });
  if (!r.ok) return { ok: false, error: r.error };
  const row = mapCvr(r.data);
  if (!row) return { ok: false, error: r.data.error ?? "Not found", state: "connected" };
  return { ok: true, data: row, observations: [], sourceUrl: url };
}

export async function nominatimGeocode(query: string): Promise<AdapterResult<{ lat: number; lng: number }>> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const r = await getJson<Array<{ lat?: string; lon?: string }>>(url, {
    headers: { "User-Agent": FETCH_UA, Accept: "application/json" },
    timeoutMs: 10000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const hit = r.data[0];
  if (!hit?.lat || !hit.lon) return { ok: false, error: "Not found", state: "connected" };
  return {
    ok: true,
    data: { lat: Number(hit.lat), lng: Number(hit.lon) },
    observations: [
      {
        field: "coordinates",
        rawValue: `${hit.lat},${hit.lon}`,
        normalisedValue: `${hit.lat},${hit.lon}`,
        confidence: 70,
        sourceReliability: reliability("nominatim"),
        extractionMethod: "nominatim",
        sourceUrl: url,
        licence: "ODbL",
        verificationStatus: "derived",
      },
    ],
    sourceUrl: url,
  };
}

function osmNameMatches(displayName: string, companyName: string): boolean {
  const n = normalizeName(companyName);
  const tokens = n.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  const blob = normalizeName(displayName);
  if (!tokens.length) return n.length >= 5 && blob.includes(n);
  const hits = tokens.filter((t) => blob.includes(t));
  return hits.length >= Math.min(2, tokens.length) || Boolean(tokens[0] && blob.includes(tokens[0]));
}

export async function nominatimPoi(
  name: string,
  municipality?: string | null,
): Promise<AdapterResult<{
  lat: number;
  lng: number;
  website: string | null;
  phone: string | null;
  email: string | null;
  displayName: string;
}>> {
  const q = [name, municipality, "Finland"].filter(Boolean).join(" ");
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&extratags=1&q=${encodeURIComponent(q)}`;
  const r = await getJson<Array<{
    lat?: string;
    lon?: string;
    name?: string;
    display_name?: string;
    extratags?: Record<string, string> | null;
  }>>(url, {
    headers: { "User-Agent": FETCH_UA, Accept: "application/json" },
    timeoutMs: 10000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const hit = (r.data ?? []).find((h) => osmNameMatches(`${h.name ?? ""} ${h.display_name ?? ""}`, name));
  if (!hit?.lat || !hit.lon) return { ok: false, error: "No matching OSM POI", state: "connected" };
  const extra = hit.extratags ?? {};
  const phoneRaw = extra.phone || extra["contact:phone"] || extra["phone:mobile"] || null;
  const emailRaw = extra.email || extra["contact:email"] || null;
  const websiteRaw = extra.website || extra["contact:website"] || extra.url || null;
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const email = emailRaw && !isJunkEmail(emailRaw) ? emailRaw.toLowerCase() : null;
  const website = normalizeWebsite(websiteRaw);
  const displayName = hit.display_name ?? hit.name ?? name;
  return {
    ok: true,
    data: { lat: Number(hit.lat), lng: Number(hit.lon), website, phone, email, displayName },
    observations: [],
    sourceUrl: url,
  };
}

export async function mxCheck(domain: string): Promise<{ mx: boolean; hosts: string[] }> {
  const host = domain.replace(/^www\./, "").toLowerCase().trim();
  if (!host) return { mx: false, hosts: [] };
  const { cacheCoalesce, cacheKey, CACHE_TTL } = await import("../intel-cache.ts");
  return cacheCoalesce(cacheKey(["mx", host]), CACHE_TTL.domain, async () => {
    try {
      const recs = await dns.resolveMx(host);
      const hosts = recs.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
      return { mx: hosts.length > 0, hosts };
    } catch {
      return { mx: false, hosts: [] };
    }
  });
}

export async function rdapDomain(domain: string): Promise<AdapterResult<{ ldhName?: string; status?: string[] }>> {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const r = await getJson<{ ldhName?: string; status?: string[] }>(url, { timeoutMs: 10000 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: { ldhName: r.data.ldhName, status: r.data.status }, observations: [], sourceUrl: url };
}

export async function gleifSearch(name: string, country?: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const params = new URLSearchParams();
  params.set("filter[entity.legalName]", name);
  if (country && country !== "EU") params.set("filter[entity.legalAddress.country]", country);
  params.set("page[size]", "8");
  const url = `https://api.gleif.org/api/v1/lei-records?${params.toString()}`;
  const r = await getJson<{
    data?: Array<{
      id?: string;
      attributes?: {
        lei?: string;
        entity?: {
          legalName?: { name?: string };
          legalAddress?: { addressLines?: string[]; city?: string; country?: string };
          status?: string;
        };
      };
    }>;
  }>(url, { headers: { Accept: "application/vnd.api+json" } });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const data: DiscoveredCompany[] = (r.data.data ?? []).map((rec) => {
    const lei = rec.attributes?.lei ?? rec.id ?? null;
    const legalName = rec.attributes?.entity?.legalName?.name ?? name;
    const addr = rec.attributes?.entity?.legalAddress;
    return {
      lei,
      name: legalName,
      country: addr?.country ?? country ?? "EU",
      street: addr?.addressLines?.join(" ") ?? null,
      municipality: addr?.city ?? null,
      businessStatus: rec.attributes?.entity?.status ?? null,
    };
  });
  return { ok: true, data, observations: [], sourceUrl: url };
}

export async function wikidataNameSearch(name: string, country: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const meta: Record<string, { qid: string; lang: string }> = {
    SE: { qid: "Q34", lang: "sv" },
    FI: { qid: "Q33", lang: "fi" },
    NO: { qid: "Q20", lang: "nb" },
    DK: { qid: "Q35", lang: "da" },
    GB: { qid: "Q145", lang: "en" },
    UK: { qid: "Q145", lang: "en" },
    DE: { qid: "Q183", lang: "de" },
    US: { qid: "Q30", lang: "en" },
  };
  const info = meta[country];
  const safe = name.replace(/["\\]/g, "").slice(0, 80);
  const countryLine = info ? `?item wdt:P17 wd:${info.qid}.` : "";
  const lang = info?.lang ?? "en";
  const q = `SELECT ?item ?itemLabel ?web ?vat ?lei WHERE {
    ${countryLine}
    ?item rdfs:label ?itemLabel.
    FILTER(LANG(?itemLabel) = "${lang}" || LANG(?itemLabel) = "en").
    FILTER(CONTAINS(LCASE(?itemLabel), LCASE("${safe}"))).
    OPTIONAL { ?item wdt:P856 ?web. }
    OPTIONAL { ?item wdt:P3608 ?vat. }
    OPTIONAL { ?item wdt:P1278 ?lei. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fi,sv,de". }
  } LIMIT 8`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
  const r = await getJson<{ results?: { bindings?: Array<Record<string, { value?: string }>> } }>(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": FETCH_UA },
    timeoutMs: 15000,
  });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const data: DiscoveredCompany[] = (r.data.results?.bindings ?? []).map((b) => {
    const vat = b.vat?.value ?? null;
    const lei = b.lei?.value ?? null;
    const bid = fromVatId(vat) ?? (vat && /^\d{7}-\d$/.test(vat) ? vat : null);
    return {
      name: b.itemLabel?.value ?? name,
      country,
      website: normalizeWebsite(b.web?.value ?? null),
      businessId: bid,
      vatId: vat,
      lei,
    };
  });
  if (!data.length) return { ok: false, error: "No Wikidata match", state: "connected" };
  return { ok: true, data, observations: [], sourceUrl: url };
}

/** Distinctive name only. VAT P3608 → Finnish Y-tunnus. Industry labels are never sent. */
export async function wikidataDiscover(opts: {
  query: string;
  country: string;
  municipality?: string | null;
  max?: number;
}): Promise<AdapterResult<DiscoveredCompany[]>> {
  const name = opts.query.replace(/["\\]/g, "").trim().slice(0, 80);
  if (name.length < 4) return { ok: false, error: "Query too short" };
  const meta: Record<string, { qid: string; lang: string }> = {
    SE: { qid: "Q34", lang: "sv" },
    FI: { qid: "Q33", lang: "fi" },
    NO: { qid: "Q20", lang: "nb" },
    DK: { qid: "Q35", lang: "da" },
    GB: { qid: "Q145", lang: "en" },
    UK: { qid: "Q145", lang: "en" },
  };
  const info = meta[opts.country] ?? { qid: "Q33", lang: "fi" };
  const city = (opts.municipality ?? "").replace(/["\\]/g, "").trim().slice(0, 40);
  const cityFilter = city
    ? `OPTIONAL { ?item wdt:P159 ?city. ?city rdfs:label ?cityLabel. FILTER(LANG(?cityLabel)="${info.lang}" || LANG(?cityLabel)="en"). }
       FILTER(!BOUND(?cityLabel) || CONTAINS(LCASE(?cityLabel), LCASE("${city}"))).`
    : "";
  const q = `SELECT ?item ?itemLabel ?web ?vat ?lei WHERE {
    ?item wdt:P17 wd:${info.qid}.
    ?item rdfs:label ?itemLabel.
    FILTER(LANG(?itemLabel) = "${info.lang}" || LANG(?itemLabel) = "en").
    FILTER(CONTAINS(LCASE(?itemLabel), LCASE("${name}"))).
    OPTIONAL { ?item wdt:P856 ?web. }
    OPTIONAL { ?item wdt:P3608 ?vat. }
    OPTIONAL { ?item wdt:P1278 ?lei. }
    ${cityFilter}
    SERVICE wikibase:label { bd:serviceParam wikibase:language "${info.lang},en". }
  } LIMIT ${Math.min(12, Math.max(4, opts.max ?? 8))}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
  const r = await getJson<{ results?: { bindings?: Array<Record<string, { value?: string }>> } }>(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": FETCH_UA },
    timeoutMs: 15000,
  });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const data: DiscoveredCompany[] = (r.data.results?.bindings ?? []).map((b) => {
    const vat = b.vat?.value ?? null;
    return {
      name: b.itemLabel?.value ?? name,
      country: opts.country,
      website: normalizeWebsite(b.web?.value ?? null),
      businessId: fromVatId(vat),
      vatId: vat,
      lei: b.lei?.value ?? null,
      municipality: city || null,
    };
  }).filter((row) => row.name && row.name.length >= 2);
  return { ok: true, data, observations: [], sourceUrl: url };
}

export async function nominatimCompanySearch(
  query: string,
  municipality?: string | null,
  max = 8,
): Promise<AdapterResult<DiscoveredCompany[]>> {
  const q = [query.trim(), municipality, "Finland"].filter(Boolean).join(" ");
  if (q.length < 4) return { ok: false, error: "Query too short" };
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${Math.min(12, Math.max(3, max))}&extratags=1&addressdetails=1&countrycodes=fi&q=${encodeURIComponent(q)}`;
  const r = await getJson<Array<{
    lat?: string;
    lon?: string;
    name?: string;
    display_name?: string;
    class?: string;
    type?: string;
    address?: { city?: string; town?: string; municipality?: string };
    extratags?: Record<string, string> | null;
  }>>(url, {
    headers: { "User-Agent": FETCH_UA, Accept: "application/json" },
    timeoutMs: 10000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const data: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const hit of r.data ?? []) {
    const name = (hit.name || "").trim();
    if (!name || name.length < 3) continue;
    const cls = `${hit.class ?? ""} ${hit.type ?? ""}`.toLowerCase();
    if (!/office|commercial|company|industrial|craft|shop|building/.test(cls) && !hit.extratags?.["operator"]) {
      if (!/\b(?:oy|oyj|ab|ltd|gmbh)\b/i.test(name)) continue;
    }
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const extra = hit.extratags ?? {};
    data.push({
      name,
      country: "FI",
      municipality: hit.address?.city || hit.address?.town || hit.address?.municipality || municipality || null,
      website: normalizeWebsite(extra.website || extra["contact:website"] || extra.url || null),
      lat: hit.lat ? Number(hit.lat) : null,
      lng: hit.lon ? Number(hit.lon) : null,
    });
    if (data.length >= max) break;
  }
  return { ok: true, data, observations: [], sourceUrl: url };
}

export async function crtshLookup(domain: string): Promise<AdapterResult<{ names: string[] }>> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  const r = await getJson<Array<{ name_value?: string }>>(url, { timeoutMs: 12000 });
  if (!r.ok) return { ok: false, error: r.error, state: r.status === 429 ? "rate_limited" : "temporarily_unavailable" };
  const names = [...new Set((Array.isArray(r.data) ? r.data : []).flatMap((row) => (row.name_value ?? "").split("\n")))].slice(0, 12);
  return { ok: true, data: { names }, observations: [], sourceUrl: url };
}
