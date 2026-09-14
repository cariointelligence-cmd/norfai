/** TTL and negative-cache policy. One lifetime is not used for every field. */

export type CacheKind =
  | "identity"
  | "financial_period"
  | "financial_absent"
  | "job_listing"
  | "website"
  | "contact"
  | "source_failed";

export const CACHE_TTL_MS: Record<CacheKind, number> = {
  identity: 30 * 86400000,
  financial_period: 14 * 86400000,
  financial_absent: 7 * 86400000,
  job_listing: 2 * 86400000,
  website: 5 * 86400000,
  contact: 5 * 86400000,
  source_failed: 30 * 60000,
};

export type CacheEntry<T> = {
  key: string;
  kind: CacheKind;
  value: T;
  absent: boolean;
  failed: boolean;
  storedAt: number;
  ttlMs: number;
};

const mem = new Map<string, CacheEntry<unknown>>();
const MEM_CAP = 2_500;

function pruneMem(now = Date.now()): void {
  if (mem.size <= MEM_CAP) return;
  for (const [k, v] of mem) {
    if (now - v.storedAt > v.ttlMs) mem.delete(k);
  }
  if (mem.size <= MEM_CAP) return;
  const overflow = mem.size - Math.floor(MEM_CAP * 0.8);
  let n = 0;
  for (const k of mem.keys()) {
    mem.delete(k);
    if (++n >= overflow) break;
  }
}

export function cacheKey(kind: CacheKind, parts: Array<string | null | undefined>): string {
  return `${kind}:${parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|")}`;
}

export function readCache<T>(key: string, now = Date.now()): CacheEntry<T> | null {
  const hit = mem.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (now - hit.storedAt > hit.ttlMs) {
    mem.delete(key);
    return null;
  }
  return hit;
}

export function writeCache<T>(opts: {
  key: string;
  kind: CacheKind;
  value: T;
  absent?: boolean;
  failed?: boolean;
  now?: number;
}): CacheEntry<T> {
  const kind = opts.kind;
  const ttlMs = opts.failed ? CACHE_TTL_MS.source_failed : CACHE_TTL_MS[kind];
  const entry: CacheEntry<T> = {
    key: opts.key,
    kind,
    value: opts.value,
    absent: Boolean(opts.absent),
    failed: Boolean(opts.failed),
    storedAt: opts.now ?? Date.now(),
    ttlMs,
  };
  mem.set(opts.key, entry);
  pruneMem(entry.storedAt);
  return entry;
}

export function rememberAbsence(kind: CacheKind, parts: Array<string | null | undefined>): void {
  writeCache({ key: cacheKey(kind, parts), kind, value: null, absent: true });
}

export function rememberFailure(kind: CacheKind, parts: Array<string | null | undefined>, error: string): void {
  writeCache({ key: cacheKey(kind, parts), kind: "source_failed", value: error, failed: true });
}

export function clearCache(): void {
  mem.clear();
}

export function cacheSize(): number {
  return mem.size;
}
