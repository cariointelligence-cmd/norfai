/**
 * PRH YTJ open data v3. Official Finnish trade register.
 * mainBusinessLine is a substring match. 2-digit divisions are queried as-is;
 * 2-digit divisions are queried first (first companies fast), then 5-digit children.
 * substring false positives (47770 from "70", 46692 from "69").
 *
 * `status` is STATUS3 (1 pending, 2 valid Y-tunnus, 5 invalidated) — not
 * trading activity. Activity comes from endDate + tradeRegisterStatus
 * (REK_KDI: 1 registered, 4 ceased).
 * `size` is ignored by the API (always 100 / page). Pagination is per-slice, not a lifetime wall.
 */
import type { AdapterResult, DiscoveredCompany, ObservationInput, SearchCriteria } from "../types.ts";
import { getJson } from "../http.ts";
import { normalizeBusinessId, normalizeName, normalizeWebsite, toVatId } from "../normalize.ts";
import { firstValue, valuesOf, passesLocalFilters } from "../criteria.ts";
import { expandIndustryQueryCodes, isAllIndustries, isInactiveCompany, INDUSTRIES } from "../finland.ts";
import { reliability } from "./catalog.ts";
import { RUNTIME } from "../runtime.ts";

const BASE = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const REL = reliability("ytj");

export const YTJ_PAGE_SIZE = 100;
/** Pages read in one discover slice. Resume continues from the next page; this is not a lifetime wall. */
export const YTJ_SCAN_PAGE_CAP = 200;

export function ytjSliceEnd(startPage: number, cap = YTJ_SCAN_PAGE_CAP): number {
  return Math.max(0, startPage) + Math.max(1, cap);
}

export type Query = {
  name?: string;
  location?: string;
  mainBusinessLine?: string;
  businessId?: string;
};

export type YtjDiscoverCursor = {
  qi: number;
  page: number;
  nationwide?: boolean;
};

export type YtjKeepHandler = (row: DiscoveredCompany) => Promise<boolean | void> | boolean | void;

type YtjName = { name?: string; type?: string; endDate?: string | null; registrationDate?: string };
type YtjDesc = { languageCode?: string; description?: string };
type YtjAddr = {
  type?: number;
  street?: string;
  buildingNumber?: string;
  postCode?: string;
  postOffices?: Array<{ city?: string; languageCode?: string; municipalityCode?: string }>;
};
type YtjRaw = {
  businessId?: { value?: string } | string;
  names?: YtjName[];
  mainBusinessLine?: { type?: string; descriptions?: YtjDesc[] };
  website?: { url?: string } | string | null;
  addresses?: YtjAddr[];
  companyForms?: Array<{ type?: string; descriptions?: YtjDesc[] }>;
  registrationDate?: string;
  endDate?: string | null;
  status?: string | number | null;
  tradeRegisterStatus?: string | number | null;
  euId?: { value?: string } | string | null;
  lastModified?: string | null;
  registeredEntries?: YtjEntry[];
  companySituations?: YtjSituation[];
};

type YtjEntry = {
  type?: string | number;
  register?: string | number;
  registrationDate?: string;
  endDate?: string | null;
  descriptions?: YtjDesc[];
};

type YtjSituation = {
  type?: string | number;
  descriptions?: YtjDesc[];
  startDate?: string;
  endDate?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickDesc(rows: YtjDesc[] | undefined): string | null {
  if (!rows?.length) return null;
  const fi = rows.find((d) => d.languageCode === "1")?.description;
  const en = rows.find((d) => d.languageCode === "3")?.description;
  const sv = rows.find((d) => d.languageCode === "2")?.description;
  return (fi || en || sv || rows[0]?.description || "").trim() || null;
}

const YTJ_REGISTER_LABEL: Record<number, { field: string; label: string }> = {
  1: { field: "trade_register", label: "Kaupparekisteri" },
  4: { field: "prepayment_register", label: "Ennakkoperintärekisteri" },
  5: { field: "employer_register", label: "Työnantajarekisteri" },
  6: { field: "vat_register", label: "ALV-rekisteri" },
  7: { field: "tax_register", label: "Verohallinnon rekisteri" },
};

export type YtjRegisterFlags = {
  euId: string | null;
  lastModified: string | null;
  tradeRegistered: boolean;
  prepaymentRegistered: boolean;
  employerRegistered: boolean;
  vatRegistered: boolean;
  situations: string[];
  labels: string[];
};

function liveEntry(entry: YtjEntry): boolean {
  return !entry.endDate;
}

function euIdOf(raw: YtjRaw): string | null {
  const v = raw.euId;
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  return (v.value ?? "").trim() || null;
}

export function parseYtjRegisters(raw: YtjRaw): YtjRegisterFlags {
  const labels: string[] = [];
  const flags: YtjRegisterFlags = {
    euId: euIdOf(raw),
    lastModified: raw.lastModified ?? null,
    tradeRegistered: false,
    prepaymentRegistered: false,
    employerRegistered: false,
    vatRegistered: false,
    situations: [],
    labels,
  };
  for (const entry of raw.registeredEntries ?? []) {
    if (!liveEntry(entry)) continue;
    const register = Number(entry.register);
    const meta = YTJ_REGISTER_LABEL[register];
    const desc = pickDesc(entry.descriptions);
    if (register === 1) flags.tradeRegistered = true;
    if (register === 4) flags.prepaymentRegistered = true;
    if (register === 5) flags.employerRegistered = true;
    if (register === 6) flags.vatRegistered = true;
    if (meta) labels.push(desc && desc !== "Rekisterissä" && desc !== "Registered" ? `${meta.label}: ${desc}` : meta.label);
    else if (desc) labels.push(desc);
  }
  for (const sit of raw.companySituations ?? []) {
    if (sit.endDate) continue;
    const desc = pickDesc(sit.descriptions);
    if (desc) flags.situations.push(desc);
  }
  return flags;
}

function officialName(names: YtjName[] | undefined): string {
  const live = (names ?? []).filter((n) => n.name && !n.endDate);
  const type1 = live.find((n) => n.type === "1") ?? live[0] ?? (names ?? []).find((n) => n.name && !n.endDate);
  return (type1?.name ?? "").replace(/\s+/g, " ").trim();
}

/** Canonical activity from PRH STATUS3 + REK_KDI. Does not invent "active" when both are missing. */
export function ytjActivityStatus(raw: {
  status?: string | number | null;
  tradeRegisterStatus?: string | number | null;
  endDate?: string | null;
}): string | null {
  const bid = String(raw.status ?? "").trim();
  const tr = String(raw.tradeRegisterStatus ?? "").trim();
  if (bid === "5") return "invalidated";
  if (raw.endDate) return "dissolved";
  if (tr === "4" || tr === "2" || tr === "0") return "ceased";
  if (tr === "3") return "pending";
  if (bid === "1") return "pending";
  if (bid === "2" || tr === "1") return "active";
  return null;
}

function pickAddress(addrs: YtjAddr[] | undefined): YtjAddr | null {
  if (!addrs?.length) return null;
  return addrs.find((a) => a.type === 1) ?? addrs.find((a) => a.type === 2) ?? addrs[0] ?? null;
}

function cityOf(addr: YtjAddr | null): { city: string | null; code: string | null } {
  if (!addr?.postOffices?.length) return { city: null, code: null };
  const fi = addr.postOffices.find((p) => p.languageCode === "1") ?? addr.postOffices[0];
  return { city: fi?.city ?? null, code: fi?.municipalityCode ?? null };
}

function websiteOf(raw: YtjRaw): string | null {
  const v = raw.website;
  if (!v) return null;
  if (typeof v === "string") return normalizeWebsite(v);
  return normalizeWebsite(v.url ?? null);
}

function bidOf(raw: YtjRaw): string | null {
  const v = raw.businessId;
  if (!v) return null;
  if (typeof v === "string") return normalizeBusinessId(v) ?? v;
  return normalizeBusinessId(v.value ?? null) ?? v.value ?? null;
}

function obs(field: string, raw: string | null, normalised: string | null, method: string, url?: string): ObservationInput {
  return {
    field,
    rawValue: raw,
    normalisedValue: normalised,
    confidence: 92,
    sourceReliability: REL,
    extractionMethod: method,
    sourceUrl: url ?? BASE,
    licence: "PRH open data CC BY 4.0",
    verificationStatus: "published",
  };
}

export function mapYtj(raw: YtjRaw, sourceUrl = BASE): { company: DiscoveredCompany; observations: ObservationInput[] } {
  const bid = bidOf(raw);
  const name = officialName(raw.names);
  const addr = pickAddress(raw.addresses);
  const city = cityOf(addr);
  const street = [addr?.street, addr?.buildingNumber].filter(Boolean).join(" ").trim() || null;
  const industryCode = raw.mainBusinessLine?.type ?? null;
  const industryLabel = pickDesc(raw.mainBusinessLine?.descriptions);
  const legalForm = pickDesc(raw.companyForms?.[0]?.descriptions);
  const legalFormCode = raw.companyForms?.[0]?.type ?? null;
  const website = websiteOf(raw);
  const flags = parseYtjRegisters(raw);
  const company: DiscoveredCompany = {
    name,
    businessId: bid,
    vatId: toVatId(bid),
    euId: flags.euId,
    country: "FI",
    industryCode,
    industryLabel,
    street,
    postalCode: addr?.postCode ?? null,
    municipality: city.city,
    municipalityCode: city.code,
    website,
    legalForm,
    legalFormCode,
    registrationDate: raw.registrationDate ?? null,
    endDate: raw.endDate ?? null,
    businessStatus: ytjActivityStatus(raw),
    tradeRegisterStatus: raw.tradeRegisterStatus == null ? null : String(raw.tradeRegisterStatus),
    lastModified: flags.lastModified,
    tradeRegistered: flags.tradeRegistered,
    prepaymentRegistered: flags.prepaymentRegistered,
    employerRegistered: flags.employerRegistered,
    vatRegistered: flags.vatRegistered,
    situations: flags.situations.length ? flags.situations : null,
  };
  return { company, observations: ytjFieldObservations(company, flags, sourceUrl) };
}

export function ytjFieldObservations(
  company: DiscoveredCompany,
  flags?: YtjRegisterFlags | null,
  sourceUrl = BASE,
): ObservationInput[] {
  const observations: ObservationInput[] = [];
  const put = (field: string, raw: string | null, normalised: string | null, evidence?: string) => {
    if (!raw && !normalised) return;
    observations.push({
      ...obs(field, raw, normalised, "ytj_v3", sourceUrl),
      evidence: evidence ?? null,
    });
  };
  put("name", company.name, company.name);
  put("business_id", company.businessId ?? null, company.businessId ?? null);
  put("vat_id", company.vatId ?? null, company.vatId ?? null);
  put("eu_id", company.euId ?? null, company.euId ?? null);
  put("industry_code", company.industryCode ?? null, company.industryCode ?? null);
  put("industry_label", company.industryLabel ?? null, company.industryLabel ?? null);
  put("municipality", company.municipality ?? null, company.municipality ?? null);
  put("postal_code", company.postalCode ?? null, company.postalCode ?? null);
  put("street", company.street ?? null, company.street ?? null);
  put("website", company.website ?? null, company.website ?? null);
  put("legal_form", company.legalForm ?? null, company.legalForm ?? null);
  put("registration_date", company.registrationDate ?? null, company.registrationDate ?? null);
  put("business_status", company.businessStatus ?? null, company.businessStatus ?? null);
  const f = flags ?? {
    tradeRegistered: Boolean(company.tradeRegistered),
    prepaymentRegistered: Boolean(company.prepaymentRegistered),
    employerRegistered: Boolean(company.employerRegistered),
    vatRegistered: Boolean(company.vatRegistered),
    situations: company.situations ?? [],
    labels: [],
    euId: company.euId ?? null,
    lastModified: company.lastModified ?? null,
  };
  if (f.tradeRegistered) put("trade_register", "1", "registered", "YTJ register 1 Kaupparekisteri");
  if (f.prepaymentRegistered) put("prepayment_register", "1", "registered", "YTJ register 4 Ennakkoperintärekisteri");
  if (f.employerRegistered) put("employer_register", "1", "registered", "YTJ register 5 Työnantajarekisteri. Not an employee count.");
  if (f.vatRegistered) put("vat_register", "1", "registered", "YTJ register 6 ALV-rekisteri");
  if (f.lastModified) put("last_modified", f.lastModified, f.lastModified, "YTJ lastModified");
  for (const sit of f.situations) put("situation", sit, sit, "YTJ companySituations");
  return observations;
}

export function buildYtjQueries(criteria: SearchCriteria): Query[] {
  const out: Query[] = [];
  const seen = new Set<string>();
  const push = (q: Query) => {
    if (q.mainBusinessLine && q.name) {
      const { name: _n, ...rest } = q;
      q = rest;
    }
    if (!q.location && !q.mainBusinessLine && !q.name && !q.businessId) return;
    const key = `${q.businessId ?? ""}|${q.mainBusinessLine ?? ""}|${q.name ?? ""}|${q.location ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(q);
  };

  const location = String(firstValue(criteria, "municipality") ?? "").trim() || undefined;
  const keywords = valuesOf(criteria, "keyword").map(String).map((s) => s.trim()).filter((s) => s.length >= 2);
  const bids = valuesOf(criteria, "business_id").map(String).map((s) => normalizeBusinessId(s) ?? s.trim()).filter(Boolean);
  const rawIndustry = valuesOf(criteria, "industry").map(String);
  const allIndustries = isAllIndustries(rawIndustry) || rawIndustry.length === 0;
  const selected = allIndustries
    ? []
    : rawIndustry.map((s) => s.replace(/\D/g, "")).filter((c) => c.length >= 2);

  for (const bid of bids.slice(0, 40)) push({ businessId: bid });

  if (allIndustries) {
    if (location) push({ location });
    else {
      const divisions = INDUSTRIES.filter((i) => i.code.length === 2).map((i) => i.code);
      const preferred = ["62", "63", "70", "73", "69", "71", "46", "47", "41", "43", "25", "28", "82", "74", "49", "56"];
      const order = [...preferred, ...divisions.filter((c) => !preferred.includes(c))];
      for (const code of order.slice(0, 16)) push({ mainBusinessLine: code });
    }
  } else {
  // 5-digit children first (denser, exact). Then the 2-digit division the user picked
  // so unlisted children (70201, 74140) are not dropped. Local prefix filter rejects
  // substring false positives.
  for (const code of selected.slice(0, 40)) {
    if (code.length >= 4) {
      push({ mainBusinessLine: code, location });
      continue;
    }
    push({ mainBusinessLine: code, location });
    const kids = expandIndustryQueryCodes([code]).filter((c) => c.length >= 4 && c !== code);
    for (const kid of kids.slice(0, 20)) push({ mainBusinessLine: kid, location });
  }
  }
  for (const name of keywords.slice(0, 4)) {
    push({ name, location });
  }
  return out.slice(0, 64);
}

function queryUrl(q: Query, page: number, size: number): string {
  const p = new URLSearchParams();
  p.set("page", String(Math.max(0, page)));
  p.set("size", String(size));
  if (q.businessId) p.set("businessId", q.businessId);
  if (q.name) p.set("name", q.name);
  if (q.location) p.set("location", q.location);
  if (q.mainBusinessLine) p.set("mainBusinessLine", q.mainBusinessLine);
  return `${BASE}?${p.toString()}`;
}

async function ytjSearchQuery(
  q: Query,
  size = YTJ_PAGE_SIZE,
  page = 0,
): Promise<AdapterResult<DiscoveredCompany[]> & { total?: number; sourceUrl?: string; rawCount?: number }> {
  const url = queryUrl(q, page, size);
  const r = await getJson<{ totalResults?: number; companies?: YtjRaw[] }>(url, { timeoutMs: 5500 });
  if (!r.ok) {
    const state = r.status === 429 ? "rate_limited" as const : r.status >= 500 ? "temporarily_unavailable" as const : undefined;
    return { ok: false, error: r.error || `YTJ HTTP ${r.status}`, state };
  }
  const rows = r.data.companies ?? [];
  const data: DiscoveredCompany[] = [];
  const observations: ObservationInput[] = [];
  for (const raw of rows) {
    const mapped = mapYtj(raw, url);
    if (!mapped.company.name) continue;
    if (isInactiveCompany(mapped.company)) continue;
    data.push(mapped.company);
    observations.push(...mapped.observations);
  }
  return { ok: true, data, observations, sourceUrl: url, total: r.data.totalResults, rawCount: rows.length };
}

async function ytjSearchQueryRetry(q: Query, size = YTJ_PAGE_SIZE, page = 0) {
  const first = await ytjSearchQuery(q, size, page);
  if (first.ok) return first;
  if (first.state !== "rate_limited") return first;
  await sleep(400);
  return ytjSearchQuery(q, size, page);
}

/** Leave a 5-digit query that only returns dissolved rows so the next live code can run. */
export function ytjShouldSkipBarrenQuery(opts: { liveThisQuery: number; deadBatches: number }): boolean {
  return opts.liveThisQuery <= 0 && opts.deadBatches >= 2;
}

async function fillFromQuery(
  q: Query,
  criteria: SearchCriteria,
  seen: Set<string>,
  kept: DiscoveredCompany[],
  maxWanted: number,
  obs: ObservationInput[],
  qurls: string[],
  deadline?: number,
  startPage = 0,
  onKeep?: YtjKeepHandler,
): Promise<{ ok: boolean; error?: string; total?: number; timedOut?: boolean; nextPage?: number; drained?: boolean; stopped?: boolean; filtered?: number }> {
  let total = 0;
  let filtered = 0;
  const BATCH = RUNTIME.ytjPageBatch;
  const pageSize = YTJ_PAGE_SIZE;
  let cursor = Math.max(0, startPage);
  const sliceEnd = ytjSliceEnd(cursor);
  let deadBatches = 0;
  let liveThisQuery = 0;
  let pending: Promise<Awaited<ReturnType<typeof ytjSearchQueryRetry>>[]> | null = null;
  while (cursor < sliceEnd && (onKeep || kept.length < maxWanted)) {
    if (deadline && Date.now() > deadline) return { ok: true, total, timedOut: true, nextPage: cursor, drained: false, filtered };
    const liveBefore = liveThisQuery;
    const pages = pending
      ? await pending
      : await Promise.all(
        Array.from({ length: BATCH }, (_, i) => ytjSearchQueryRetry(q, pageSize, cursor + i)),
      );
    if (cursor + BATCH < sliceEnd) {
      pending = Promise.all(
        Array.from({ length: BATCH }, (_, i) => ytjSearchQueryRetry(q, pageSize, cursor + BATCH + i)),
      );
    } else {
      pending = null;
    }
    let anyRaw = false;
    let rateLimited = false;
    let okPages = 0;
    let okEmpty = 0;
    for (const r of pages) {
      if (!r.ok) {
        if (r.state === "rate_limited") rateLimited = true;
        continue;
      }
      okPages += 1;
      if (typeof r.total === "number" && r.total > 0) total = r.total;
      if (r.sourceUrl) qurls.push(r.sourceUrl);
      const rawCount = typeof r.rawCount === "number" ? r.rawCount : r.data.length;
      if (rawCount === 0) {
        okEmpty += 1;
        continue;
      }
      anyRaw = true;
      for (const co of r.data) {
        const key = co.businessId || co.name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const local = passesLocalFilters(co, criteria);
        if (!local.ok) {
          filtered += 1;
          continue;
        }
        kept.push(co);
        liveThisQuery += 1;
        obs.push(...(r.observations ?? []));
        if (onKeep) {
          const more = await onKeep(co);
          if (more === false) return { ok: true, total, nextPage: cursor, drained: false, stopped: true, filtered };
        } else if (kept.length >= maxWanted) break;
      }
    }
    if (anyRaw && liveThisQuery === liveBefore) deadBatches += 1;
    else if (liveThisQuery > liveBefore) deadBatches = 0;
    if (ytjShouldSkipBarrenQuery({ liveThisQuery, deadBatches })) {
      return { ok: true, total, nextPage: cursor + BATCH, drained: true, filtered };
    }
    cursor += BATCH;
    // Drain only when the API itself returned empty pages, never when live
    // rows were filtered out. Dissolved-first sort would otherwise skip the rest.
    if (!anyRaw && !rateLimited && okPages > 0 && okEmpty === okPages) {
      return { ok: true, total, nextPage: cursor, drained: true, filtered };
    }
    if (rateLimited) await sleep(1200);
    if (!anyRaw && !rateLimited && okPages === 0) {
      return { ok: true, total, nextPage: cursor, drained: cursor > startPage, filtered };
    }
  }
  return { ok: true, total, nextPage: cursor, drained: false, filtered };
}

export async function ytjFetchById(businessId: string): Promise<AdapterResult<DiscoveredCompany> & { sourceUrl?: string }> {
  const bid = normalizeBusinessId(businessId) ?? businessId.trim();
  if (!bid) return { ok: false, error: "Invalid business ID" };
  const r = await ytjSearchQuery({ businessId: bid }, 1, 0);
  if (!r.ok) return { ok: false, error: r.error, state: r.state };
  const row = r.data[0];
  if (!row) return { ok: false, error: "Not found" };
  return { ok: true, data: row, observations: r.observations, sourceUrl: r.sourceUrl };
}

/** Distinctive toiminimi only. Callers must still run the criteria gate. */
export async function ytjFetchByName(name: string): Promise<AdapterResult<DiscoveredCompany> & { sourceUrl?: string }> {
  const q = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 4) return { ok: false, error: "Name too short" };
  const r = await ytjSearchQuery({ name: q }, 10, 0);
  if (!r.ok) return { ok: false, error: r.error, state: r.state };
  const want = normalizeName(q);
  const hit =
    r.data.find((row) => normalizeName(row.name) === want) ??
    r.data.find((row) => {
      const got = normalizeName(row.name);
      return got.length >= 6 && want.length >= 6 && (got.includes(want) || want.includes(got));
    });
  if (!hit) return { ok: false, error: "Not found" };
  return { ok: true, data: hit, observations: r.observations, sourceUrl: r.sourceUrl };
}

export async function ytjHealth(): Promise<{ ok: boolean; detail: string }> {
  const t0 = Date.now();
  const r = await ytjFetchById("0112038-9");
  const ms = Date.now() - t0;
  if (!r.ok) return { ok: false, detail: r.error || "YTJ unreachable" };
  return { ok: true, detail: `${r.data.name} ${ms}ms` };
}

export async function ytjDiscover(
  criteria: SearchCriteria,
  opts?: { skipKeys?: Set<string>; deadline?: number; cursor?: YtjDiscoverCursor | null; onKeep?: YtjKeepHandler },
): Promise<AdapterResult<DiscoveredCompany[]> & {
  cursor?: YtjDiscoverCursor | null;
  timedOut?: boolean;
  exhausted?: boolean;
  registerHits?: number;
  queries?: number;
  expandedNationwide?: boolean;
  sourceUrl?: string;
  filtered?: number;
  attached?: boolean;
}> {
  const maxWanted = Math.max(1, Number(criteria.maxResults ?? 100));
  const location = String(firstValue(criteria, "municipality") ?? "").trim();
  let nationwide = Boolean(opts?.cursor?.nationwide);
  const makeQueries = (dropLocation: boolean): Query[] => {
    if (!dropLocation) return buildYtjQueries(criteria);
    const copy: SearchCriteria = {
      ...criteria,
      groups: {
        ...criteria.groups,
        rules: criteria.groups.rules.filter((r) => "rules" in r || r.field !== "municipality"),
      },
    };
    return buildYtjQueries(copy);
  };
  let queries = makeQueries(nationwide);
  if (!queries.length) return { ok: false, error: "No YTJ query could be built from the filters" };

  const seen = new Set<string>(opts?.skipKeys ?? []);
  const kept: DiscoveredCompany[] = [];
  const observations: ObservationInput[] = [];
  const qurls: string[] = [];
  let qi = Math.max(0, opts?.cursor?.qi ?? 0);
  let page = Math.max(0, opts?.cursor?.page ?? 0);
  let registerHits = 0;
  let filtered = 0;
  let timedOut = false;
  let lastError: string | undefined;

  const runPass = async () => {
    while (qi < queries.length && (opts?.onKeep || kept.length < maxWanted)) {
      if (opts?.deadline && Date.now() > opts.deadline) {
        timedOut = true;
        return;
      }
      const q = queries[qi]!;
      const r = await fillFromQuery(q, criteria, seen, kept, maxWanted, observations, qurls, opts?.deadline, page, opts?.onKeep);
      if (typeof r.total === "number") registerHits = Math.max(registerHits, r.total);
      if (typeof r.filtered === "number") filtered += r.filtered;
      if (!r.ok && r.error) lastError = r.error;
      if (r.timedOut) {
        timedOut = true;
        page = r.nextPage ?? page;
        return;
      }
      if (r.stopped || (!opts?.onKeep && kept.length >= maxWanted)) {
        page = r.nextPage ?? page;
        return;
      }
      if (r.drained) {
        qi += 1;
        page = 0;
        continue;
      }
      page = r.nextPage ?? page;
      return;
    }
  };

  await runPass();

  if (!timedOut && kept.length < maxWanted && location && !nationwide && qi >= queries.length) {
    nationwide = true;
    queries = makeQueries(true);
    qi = 0;
    page = 0;
    if (opts?.deadline && Date.now() > opts.deadline) {
      timedOut = true;
    } else {
      await runPass();
    }
  }

  const sliceComplete = !timedOut && (qi >= queries.length);
  const exhausted = sliceComplete && (nationwide || !location);
  const cursor: YtjDiscoverCursor | null = exhausted || (sliceComplete && kept.length >= maxWanted)
    ? null
    : { qi, page, nationwide: nationwide || undefined };

  if (!kept.length && lastError && registerHits === 0 && !timedOut) {
    return { ok: false, error: lastError, state: "temporarily_unavailable" };
  }
  return {
    ok: true,
    data: kept,
    observations,
    sourceUrl: qurls[0],
    cursor,
    timedOut,
    exhausted,
    registerHits,
    queries: queries.length,
    expandedNationwide: nationwide,
    filtered,
    attached: Boolean(opts?.onKeep),
  };
}
