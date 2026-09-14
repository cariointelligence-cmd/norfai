/**
 * Optional Vercel KV / Upstash REST cache.
 * Off unless marketplace env is present. Never required for search correctness.
 */
function creds(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (!url || !token) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return { url, token };
}

export function kvConfigured(): boolean {
  return Boolean(creds());
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  const c = creds();
  if (!c) return null;
  try {
    const r = await fetch(`${c.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(800),
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { result?: string | null };
    if (!body.result) return null;
    return JSON.parse(body.result) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  const c = creds();
  if (!c) return;
  const ttl = Math.max(30, Math.min(Math.round(ttlSec), 7 * 24 * 3600));
  try {
    const payload = JSON.stringify(value);
    if (payload.length > 200_000) return;
    await fetch(`${c.url}/set/${encodeURIComponent(key)}/ex/${ttl}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(800),
    });
  } catch {
    /* keep local cache */
  }
}
