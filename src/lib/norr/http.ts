import { FETCH_UA, safeFetch, UnsafeUrlError } from "./ssrf.ts";

export type HttpJson<T> = {
  ok: true;
  status: number;
  url: string;
  data: T;
  latencyMs: number;
} | {
  ok: false;
  status: number;
  url: string;
  error: string;
  latencyMs: number;
};

export async function getJson<T>(
  url: string,
  init: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number } = {},
): Promise<HttpJson<T>> {
  const t0 = Date.now();
  try {
    const res = await safeFetch(url, {
      timeoutMs: init.timeoutMs ?? 15000,
      maxBytes: init.maxBytes,
      headers: {
        Accept: "application/json",
        "User-Agent": FETCH_UA,
        ...init.headers,
      },
    });
    const latencyMs = Date.now() - t0;
    if (res.status === 429) {
      return { ok: false, status: 429, url: res.url, error: "Rate limited", latencyMs };
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        status: res.status,
        url: res.url,
        error: `HTTP ${res.status}`,
        latencyMs,
      };
    }
    try {
      return { ok: true, status: res.status, url: res.url, data: JSON.parse(res.body) as T, latencyMs };
    } catch {
      return { ok: false, status: res.status, url: res.url, error: "Invalid JSON", latencyMs };
    }
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof UnsafeUrlError ? err.message : err instanceof Error ? err.message : "Request failed";
    return { ok: false, status: 0, url, error: msg, latencyMs };
  }
}

export async function postJson<T>(
  url: string,
  body: unknown,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<HttpJson<T>> {
  const t0 = Date.now();
  try {
    const res = await safeFetch(url, {
      method: "POST",
      timeoutMs: init.timeoutMs ?? 20000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": FETCH_UA,
        ...init.headers,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - t0;
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, url: res.url, error: `HTTP ${res.status}`, latencyMs };
    }
    return { ok: true, status: res.status, url: res.url, data: JSON.parse(res.body) as T, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = err instanceof Error ? err.message : "Request failed";
    return { ok: false, status: 0, url, error: msg, latencyMs };
  }
}
