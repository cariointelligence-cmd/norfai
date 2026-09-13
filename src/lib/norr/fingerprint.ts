import { createHash } from "node:crypto";
import type { SearchCriteria } from "./types.ts";
import { flattenRules, valuesOf } from "./criteria.ts";

/** Bump when ranking weights or novelty formula change. Historical runs keep their version. */
export const RANKING_VERSION = "rank-v3-query-aware";

export type FingerprintPayload = {
  country: string;
  industry: string[];
  municipality: string[];
  keyword: string[];
  businessId: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  foundedFrom: string | null;
  foundedTo: string | null;
  legalForm: string[];
  preset: string | null;
  mode: string;
  target: unknown;
};

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function strList(c: SearchCriteria, field: Parameters<typeof valuesOf>[1]): string[] {
  return [...new Set(valuesOf(c, field).map((x) => String(x).trim().toLowerCase()).filter(Boolean))].sort();
}

export function fingerprintPayload(c: SearchCriteria): FingerprintPayload {
  return {
    country: (c.country || "FI").toUpperCase(),
    industry: strList(c, "industry"),
    municipality: strList(c, "municipality"),
    keyword: strList(c, "keyword"),
    businessId: strList(c, "business_id"),
    revenueMin: numOrNull(valuesOf(c, "revenue_min")[0] ?? c.target?.financial?.revenue?.min),
    revenueMax: numOrNull(valuesOf(c, "revenue_max")[0] ?? c.target?.financial?.revenue?.max),
    employeeMin: numOrNull(valuesOf(c, "employee_min")[0]),
    employeeMax: numOrNull(valuesOf(c, "employee_max")[0]),
    foundedFrom: valuesOf(c, "founded_from")[0] != null ? String(valuesOf(c, "founded_from")[0]) : null,
    foundedTo: valuesOf(c, "founded_to")[0] != null ? String(valuesOf(c, "founded_to")[0]) : null,
    legalForm: strList(c, "legal_form"),
    preset: c.preset ?? null,
    mode: c.mode ?? "quick",
    target: c.target ?? {},
  };
}

export function queryFingerprint(c: SearchCriteria): string {
  const payload = fingerprintPayload(c);
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json).digest("hex");
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

function rangeOverlap(aMin: number | null, aMax: number | null, bMin: number | null, bMax: number | null): number {
  const aLo = aMin ?? 0;
  const aHi = aMax ?? Number.POSITIVE_INFINITY;
  const bLo = bMin ?? 0;
  const bHi = bMax ?? Number.POSITIVE_INFINITY;
  const lo = Math.max(aLo, bLo);
  const hi = Math.min(aHi, bHi);
  if (!Number.isFinite(aHi) && !Number.isFinite(bHi) && aMin == null && bMin == null) return 1;
  if (hi <= lo) return 0;
  const span = Math.max(aHi === Infinity ? bHi : aHi, bHi === Infinity ? aHi : bHi) - Math.min(aLo, bLo);
  if (!Number.isFinite(span) || span <= 0) return hi > lo ? 1 : 0;
  const overlap = hi - lo;
  return Math.max(0, Math.min(1, overlap / span));
}

/** Deterministic 0..1 similarity. Exact fingerprint is 1. No embeddings. */
export function querySimilarity(a: SearchCriteria, b: SearchCriteria): number {
  if (queryFingerprint(a) === queryFingerprint(b)) return 1;
  const pa = fingerprintPayload(a);
  const pb = fingerprintPayload(b);
  const industry = jaccard(pa.industry, pb.industry);
  const geo = jaccard(pa.municipality, pb.municipality);
  const kw = jaccard(pa.keyword, pb.keyword);
  const rev = rangeOverlap(pa.revenueMin, pa.revenueMax, pb.revenueMin, pb.revenueMax);
  const country = pa.country === pb.country ? 1 : 0;
  const preset = pa.preset && pa.preset === pb.preset ? 1 : pa.preset || pb.preset ? 0.4 : 0.7;
  return Math.round((country * 0.2 + industry * 0.32 + geo * 0.18 + rev * 0.18 + kw * 0.07 + preset * 0.05) * 1000) / 1000;
}

export function searchLabel(c: SearchCriteria): string {
  const p = fingerprintPayload(c);
  const bits: string[] = [];
  if (p.preset) bits.push(p.preset.replaceAll("_", " "));
  if (p.industry.length) bits.push(p.industry.slice(0, 4).join(", "));
  if (p.municipality.length) bits.push(p.municipality.join(", "));
  bits.push(p.country);
  if (p.revenueMin != null || p.revenueMax != null) {
    const lo = p.revenueMin != null ? `€${Math.round(p.revenueMin / 1e6)}M` : "";
    const hi = p.revenueMax != null ? `€${Math.round(p.revenueMax / 1e6)}M` : "";
    bits.push([lo, hi].filter(Boolean).join(" to "));
  }
  return bits.filter(Boolean).join(" · ") || "Search";
}

/** Fill a readable name and fingerprint for runs stored before ranking-v2, without rewriting filters. */
export function legacyRunMeta(row: { name?: string | null; criteria?: unknown }): { name: string; fingerprint: string | null } {
  const named = typeof row.name === "string" ? row.name.trim() : "";
  const raw = row.criteria;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("groups" in raw) || !(raw as SearchCriteria).groups) {
    return { name: named || "Search", fingerprint: null };
  }
  const criteria = raw as SearchCriteria;
  return { name: named || searchLabel(criteria), fingerprint: queryFingerprint(criteria) };
}

export type RunCursor = { r: number; i: string };

export function encodeRunCursor(rank: number, companyId: string): string {
  return Buffer.from(JSON.stringify({ r: rank, i: companyId }), "utf8").toString("base64url");
}

export function decodeRunCursor(raw: string | null | undefined): RunCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { r?: unknown; i?: unknown };
    if (typeof parsed.r !== "number" || typeof parsed.i !== "string" || !parsed.i) return null;
    if (!Number.isFinite(parsed.r) || parsed.r < 0) return null;
    return { r: parsed.r, i: parsed.i.slice(0, 80) };
  } catch {
    return null;
  }
}

export function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function paginationDuplicates(pages: string[][]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const page of pages) {
    for (const id of page) {
      if (seen.has(id)) dup.push(id);
      else seen.add(id);
    }
  }
  return dup;
}

export function compareRunSets(prev: string[], next: string[]): { added: string[]; removed: string[]; kept: string[] } {
  const a = new Set(prev);
  const b = new Set(next);
  const added: string[] = [];
  const kept: string[] = [];
  const removed: string[] = [];
  for (const id of b) {
    if (a.has(id)) kept.push(id);
    else added.push(id);
  }
  for (const id of a) if (!b.has(id)) removed.push(id);
  return { added, removed, kept };
}

export { flattenRules };
