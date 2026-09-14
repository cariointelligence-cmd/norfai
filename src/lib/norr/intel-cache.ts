/**
 * Public-company intelligence cache. Never stores workspace notes, lists, or CRM.
 * L1: process-local. L2: Vercel KV / Upstash when marketplace env is present.
 */
type Entry<T> = { at: number; ttl: number; value: T; inflight?: Promise<T> };

const store = new Map<string, Entry<unknown>>();
const stats = { hits: 0, misses: 0, stale: 0, coalesced: 0, sets: 0 };

const STORE_CAP = 2_500;

function pruneStore(now = Date.now()): void {
  if (store.size <= STORE_CAP) return;
  for (const [k, v] of store) {
    if (now - v.at > v.ttl) store.delete(k);
  }
  if (store.size <= STORE_CAP) return;
  const overflow = store.size - Math.floor(STORE_CAP * 0.8);
  let n = 0;
  for (const k of store.keys()) {
    store.delete(k);
    if (++n >= overflow) break;
  }
}

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
  store.delete(key);
  store.set(key, row);
  return row.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { at: Date.now(), ttl: ttlMs, value });
  stats.sets += 1;
  pruneStore();
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
  const inflight = (async () => {
    const { kvConfigured, kvGetJson, kvSetJson } = await import("./kv-cache.ts");
    if (kvConfigured()) {
      const remote = await kvGetJson<T>(`norf:ic:${key}`);
      if (remote != null) {
        cacheSet(key, remote, ttlMs);
        return remote;
      }
    }
    const value = await fn();
    cacheSet(key, value, ttlMs);
    if (kvConfigured()) void kvSetJson(`norf:ic:${key}`, value, ttlMs / 1000);
    return value;
  })();
  store.set(key, { at: Date.now(), ttl: ttlMs, value: undefined as T, inflight });
  return inflight.then((value) => {
    const row = store.get(key) as Entry<T> | undefined;
    if (row) delete row.inflight;
    return value;
  });
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
