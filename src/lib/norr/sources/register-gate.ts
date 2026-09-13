/**
 * Criteria gate on top of homemade register / directory hits.
 * Official YTJ (and peer registers) stay first. Extra sources may only keep a
 * company after the row matches the search filters — never because a directory
 * happened to list it.
 */
import type { DiscoveredCompany, SearchCriteria } from "../types.ts";
import { firstValue, passesLocalFilters, valuesOf } from "../criteria.ts";
import { industryLabel, expandIndustryQueryCodes } from "../finland.ts";
import { coreCompanyName, isDistinctiveCoreName } from "../dedupe.ts";
import { normalizeBusinessId, normalizeName } from "../normalize.ts";

const GENERIC_QUERY = /^(?:oy|oyj|ab|abp|ky|ry|as|company|yritys|yritykset|palvelu|palvelut|group|holding|finland|suomi|suomen|nordic|international|solutions|systems|service|services)$/i;

export function isGenericDiscoverQuery(q: string): boolean {
  const t = q.trim().toLowerCase().replace(/["']/g, "");
  if (t.length < 3) return true;
  if (GENERIC_QUERY.test(t)) return true;
  if (/^(?:oy|ab)\s+/i.test(t) && t.length < 8) return true;
  return false;
}

/** Completes a 7-digit Finnish body to Y-tunnus, or validates 8 digits. */
export function businessIdFromDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 8) return normalizeBusinessId(d);
  if (d.length !== 7) return normalizeBusinessId(raw);
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const sum = d.split("").reduce((acc, ch, i) => acc + Number(ch) * (weights[i] ?? 0), 0);
  const rem = sum % 11;
  if (rem === 1) return null;
  const check = rem === 0 ? 0 : 11 - rem;
  return normalizeBusinessId(`${d}${check}`);
}

export function bidFromFinderUrl(url: string): string | null {
  const m = /yhteystiedot\/(\d{7,8})(?:[/?#]|$)/i.exec(url);
  return m ? businessIdFromDigits(m[1]) : null;
}

export function bidFromKauppalehtiUrl(url: string): string | null {
  const m = /\/yritykset\/yritys\/(?:[^/]+\/)?(\d{7,8})(?:[/?#]|$)/i.exec(url);
  return m ? businessIdFromDigits(m[1]) : null;
}

export function bidFromSnippet(text: string): string | null {
  const hyphen = text.match(/\b(\d{7}-\d)\b/);
  if (hyphen) return normalizeBusinessId(hyphen[1]);
  const prh = text.match(/PRH\s+(\d{7}-\d)/i);
  if (prh) return normalizeBusinessId(prh[1]);
  return null;
}

/** Finnish TOL 41200 → NACE-like 41.200 for Brønnøysund. */
export function naceFromTol(code: string): string | null {
  const d = String(code).replace(/\D/g, "");
  if (d.length < 2) return null;
  if (d.length === 2) return d;
  if (d.length === 3) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length === 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2)}`;
}

export function looksLikeCompanyName(q: string): boolean {
  const t = q.trim();
  if (t.length < 4 || isGenericDiscoverQuery(t)) return false;
  if (/\b(?:oy|oyj|ab|abp|gmbh|ltd|limited|as|aps|inc|corp)\b/i.test(t)) return true;
  if (/\d{7}/.test(t)) return true;
  const words = t.split(/\s+/).filter((w) => w.length >= 3);
  return words.length >= 2 && !/rakentaminen|markkinointi|ohjelmist|palvelut|consulting/i.test(t);
}

/** Official hydrate may only attach when the directory name and the register name are the same entity. */
export function namesCompatible(directoryName: string, officialName: string): boolean {
  const na = directoryName.trim();
  const nb = officialName.trim();
  if (!na || !nb) return false;
  if (normalizeName(na) === normalizeName(nb)) return true;
  const ca = coreCompanyName(na);
  const cb = coreCompanyName(nb);
  if (ca && cb && ca === cb && isDistinctiveCoreName(ca)) return true;
  return false;
}

export function discoverQuerySeeds(criteria: SearchCriteria): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || t.length < 3 || isGenericDiscoverQuery(t) || out.includes(t)) return;
    out.push(t);
  };
  const mun = String(firstValue(criteria, "municipality") ?? "").trim();
  const keywords = valuesOf(criteria, "keyword").map(String).map((s) => s.trim()).filter(Boolean);
  for (const kw of keywords) {
    if (isGenericDiscoverQuery(kw)) continue;
    push(kw);
    if (mun) push(`${kw} ${mun}`);
  }
  const industries = expandIndustryQueryCodes(valuesOf(criteria, "industry").map(String)).slice(0, 8);
  for (const code of industries) {
    const label = industryLabel(code) ?? "";
    const short = label.split(/[/,]/)[0]?.trim() ?? "";
    if (short.length >= 6) {
      push(short);
      if (mun) push(`${short} ${mun}`);
    }
    if (code.length >= 4) {
      const parentLabel = industryLabel(code.slice(0, 2)) ?? "";
      const parentShort = parentLabel.split(/[/,]/)[0]?.trim() ?? "";
      if (parentShort.length >= 6) {
        push(parentShort);
        if (mun) push(`${parentShort} ${mun}`);
      }
    }
  }
  const bid = String(firstValue(criteria, "business_id") ?? "").trim();
  if (bid) push(bid);
  return out.slice(0, 6);
}

export function needsOfficialIndustry(criteria: SearchCriteria): boolean {
  return valuesOf(criteria, "industry").length > 0;
}

function countryOk(row: DiscoveredCompany, criteria: SearchCriteria): boolean {
  const want = (criteria.country || "FI").toUpperCase();
  const got = (row.country || "").toUpperCase();
  if (!got) return true;
  if (want === "EU") return true;
  if (got === "EU") return want !== "US";
  if (want === "GB" && got === "UK") return true;
  return got === want;
}

function legalFormOk(row: DiscoveredCompany, criteria: SearchCriteria): boolean {
  const wanted = valuesOf(criteria, "legal_form").map((v) => String(v).toLowerCase());
  if (!wanted.length) return true;
  const blob = `${row.legalForm ?? ""} ${row.legalFormCode ?? ""}`.toLowerCase();
  if (!blob.trim()) return false;
  return wanted.some((w) => blob.includes(w) || (w === "oy" && /osakeyhtiö|limited company/.test(blob)));
}

export function acceptDiscovered(
  row: DiscoveredCompany,
  criteria: SearchCriteria,
): { ok: boolean; reasons: string[]; missed: string[] } {
  if (!row.name || row.name.trim().length < 2) {
    return { ok: false, reasons: [], missed: ["name missing"] };
  }
  if (!countryOk(row, criteria)) {
    return { ok: false, reasons: [], missed: [`country ${row.country}`] };
  }
  if (!legalFormOk(row, criteria)) {
    return { ok: false, reasons: [], missed: ["legal form"] };
  }
  if (needsOfficialIndustry(criteria) && !row.industryCode && !row.industryLabel) {
    return { ok: false, reasons: [], missed: ["industry unknown"] };
  }
  const local = passesLocalFilters(row, criteria);
  if (!local.ok) return local;
  return { ok: true, reasons: local.reasons, missed: local.missed };
}

export function mergeOfficial(candidate: DiscoveredCompany, official: DiscoveredCompany): DiscoveredCompany {
  return {
    ...candidate,
    ...official,
    name: official.name || candidate.name,
    businessId: official.businessId ?? candidate.businessId ?? null,
    vatId: official.vatId ?? candidate.vatId ?? null,
    lei: official.lei ?? candidate.lei ?? null,
    website: official.website ?? candidate.website ?? null,
    street: official.street ?? candidate.street ?? null,
    municipality: official.municipality ?? candidate.municipality ?? null,
    postalCode: official.postalCode ?? candidate.postalCode ?? null,
    industryCode: official.industryCode ?? candidate.industryCode ?? null,
    industryLabel: official.industryLabel ?? candidate.industryLabel ?? null,
    legalForm: official.legalForm ?? candidate.legalForm ?? null,
    legalFormCode: official.legalFormCode ?? candidate.legalFormCode ?? null,
    registrationDate: official.registrationDate ?? candidate.registrationDate ?? null,
    businessStatus: official.businessStatus ?? candidate.businessStatus ?? null,
    tradeRegisterStatus: official.tradeRegisterStatus ?? candidate.tradeRegisterStatus ?? null,
    endDate: official.endDate ?? candidate.endDate ?? null,
    country: official.country || candidate.country,
  };
}

export function parseKauppalehtiSearchHtml(html: string): DiscoveredCompany[] {
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const re = /href="((?:https?:\/\/www\.kauppalehti\.fi)?\/yritykset\/yritys\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1]?.startsWith("http") ? m[1] : `https://www.kauppalehti.fi${m[1]}`;
    const bid = bidFromKauppalehtiUrl(url ?? "");
    const name = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const key = bid || name.toLowerCase();
    if (!key || seen.has(key) || name.length < 2) continue;
    if (/kirjaudu|tilaa|kauppalehti/i.test(name)) continue;
    seen.add(key);
    out.push({ name, businessId: bid, country: "FI", website: null });
    if (out.length >= 16) break;
  }
  return out;
}
