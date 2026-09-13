/**
 * Public-company intelligence cache. Never stores workspace notes, lists, or CRM.
 * Process-local on Vercel; coalesces identical lookups within a freshness window.
 */
type Entry<T> = { at: number; ttl: number; value: T; inflight?: Promise<T> };

const store = new Map<string, Entry<unknown>>();
const stats = { hits: 0, misses: 0, stale: 0, coalesced: 0, sets: 0 };

export const CACHE_TTL = {
  identity: 24 * 3_600_000,
  domain: 12 * 3_600_000,
  contacts: 6 * 3_600_000,
  website: 6 * 3_600_000,
  financial: 7 * 24 * 3_600_000,
  negative: 30 * 60_000,
} as const;

export function cacheKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
}

export function cacheGet<T>(key: string): T | null {
  const row = store.get(key) as Entry<T> | undefined;
  if (!row) {
    stats.misses += 1;
    return null;
  }
  if (Date.now() - row.at > row.ttl) {
    stats.stale += 1;
    store.delete(key);
    return null;
  }
  stats.hits += 1;
  return row.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  stats.sets += 1;
  if (store.size > 4_000) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (now - v.at > v.ttl) store.delete(k);
    }
  }
  return value;
}

export async function cacheCoalesce<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit != null) return hit;
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing?.inflight) {
    stats.coalesced += 1;
    return existing.inflight;
  }
  const inflight = fn().then((value) => {
    cacheSet(key, value, ttlMs);
    const row = store.get(key) as Entry<T> | undefined;
    if (row) delete row.inflight;
    return value;
  });
  store.set(key, { at: Date.now(), ttl: ttlMs, value: undefined as T, inflight });
  return inflight;
}

export function cacheStats() {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    size: store.size,
    hitRate: total ? stats.hits / total : 0,
  };
}

export function resetIntelCacheForTests(): void {
  store.clear();
  stats.hits = stats.misses = stats.stale = stats.coalesced = stats.sets = 0;
}
