/**
 * Public-company intelligence cache. Never stores workspace notes, lists, or CRM.
 * L1: process-local with stale-while-revalidate.
 * L2: Vercel KV / Upstash when marketplace env is present (never on the hot path longer than 200ms).
 */
type Entry<T> = { at: number; ttl: number; value: T; inflight?: Promise<T> };

const store = new Map<string, Entry<unknown>>();
const stats = { hits: 0, misses: 0, stale: 0, coalesced: 0, sets: 0, kvHits: 0 };

export const STORE_CAP = 8_000;

function pruneStore(now = Date.now()): void {
  if (store.size <= STORE_CAP) return;
  for (const [k, v] of store) {
    if (now - v.at > v.ttl * 3 && !v.inflight) store.delete(k);
  }
  if (store.size <= STORE_CAP) return;
  const overflow = store.size - Math.floor(STORE_CAP * 0.8);
  let n = 0;
  for (const [k, v] of store) {
    if (v.inflight) continue;
    store.delete(k);
    if (++n >= overflow) break;
  }
}

function touch<T>(key: string, row: Entry<T>): void {
  store.delete(key);
  store.set(key, row);
}

export const CACHE_TTL = {
  identity: 24 * 3_600_000,
  domain: 12 * 3_600_000,
  contacts: 6 * 3_600_000,
  website: 6 * 3_600_000,
  financial: 7 * 24 * 3_600_000,
  negative: 2 * 60_000,
} as const;

export function cacheKey(parts: Array<string | number | null | undefined>): string {
  return parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function ttlFor(value: unknown, ttlMs: number): number {
  if (isEmptyValue(value)) return Math.min(ttlMs, CACHE_TTL.negative);
  return ttlMs;
}

function ageMs(row: Entry<unknown>, now = Date.now()): number {
  return now - row.at;
}

export function cacheGet<T>(key: string): T | null {
  const row = store.get(key) as Entry<T> | undefined;
  if (!row || row.value === undefined) {
    stats.misses += 1;
    return null;
  }
  if (ageMs(row) > row.ttl) {
    stats.stale += 1;
    return null;
  }
  stats.hits += 1;
  touch(key, row);
  return row.value;
}

/** Fresh or stale (until 3× TTL). Does not start a refresh. */
export function cacheGetStale<T>(key: string): T | null {
  const row = store.get(key) as Entry<T> | undefined;
  if (!row || row.value === undefined) return null;
  if (ageMs(row) > row.ttl * 3) return null;
  return row.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  store.set(key, { at: Date.now(), ttl: ttlFor(value, ttlMs), value });
  stats.sets += 1;
  pruneStore();
  return value;
}

async function loadRemote<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const { kvConfigured, kvGetJson } = await import("./kv-cache.ts");
    if (!kvConfigured()) return null;
    const remote = await kvGetJson<T>(`norf:ic:${key}`);
    if (remote == null) return null;
    stats.kvHits += 1;
    cacheSet(key, remote, ttlMs);
    return remote;
  } catch {
    return null;
  }
}

function persistRemote(key: string, value: unknown, ttlMs: number): void {
  void import("./kv-cache.ts").then(({ kvConfigured, kvSetJson }) => {
    if (!kvConfigured()) return;
    void kvSetJson(`norf:ic:${key}`, value, ttlFor(value, ttlMs) / 1000);
  }).catch(() => undefined);
}

export async function cacheCoalesce<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing?.inflight && existing.value !== undefined && ageMs(existing) < existing.ttl * 3) {
    stats.coalesced += 1;
    stats.stale += 1;
    return existing.value;
  }
  if (existing?.inflight) {
    stats.coalesced += 1;
    return existing.inflight;
  }
  if (existing && existing.value !== undefined && ageMs(existing) <= existing.ttl) {
    stats.hits += 1;
    touch(key, existing);
    return existing.value;
  }
  if (existing && existing.value !== undefined && ageMs(existing) < existing.ttl * 3) {
    stats.stale += 1;
    const inflight = (async () => {
      try {
        const value = await fn();
        cacheSet(key, value, ttlMs);
        persistRemote(key, value, ttlMs);
        return value;
      } catch (err) {
        const row = store.get(key) as Entry<T> | undefined;
        if (row) delete row.inflight;
        throw err;
      }
    })();
    existing.inflight = inflight;
    void inflight.then(() => {
      const row = store.get(key) as Entry<T> | undefined;
      if (row) delete row.inflight;
    }, () => undefined);
    return existing.value;
  }

  stats.misses += 1;
  const inflight = (async () => {
    const remote = await loadRemote<T>(key, ttlMs);
    if (remote != null) return remote;
    const value = await fn();
    cacheSet(key, value, ttlMs);
    persistRemote(key, value, ttlMs);
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
  const total = stats.hits + stats.misses + stats.stale;
  return {
    ...stats,
    size: store.size,
    hitRate: total ? (stats.hits + stats.stale) / total : 0,
  };
}

export function resetIntelCacheForTests(): void {
  store.clear();
  stats.hits = stats.misses = stats.stale = stats.coalesced = stats.sets = stats.kvHits = 0;
}
