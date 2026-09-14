/**
 * Edge shield for /api/*. Session routes still authenticate; this stops
 * unauthenticated scraping, oversized bodies, and secret-leaking health probes.
 */
import { isTrustedOrigin, rateLimit, rateLimitMessage, safeEqual, securityHeaderMap } from "./security.ts";

const SCANNER_UA = /sqlmap|nikto|dirbuster|masscan|zgrab|nuclei|httpx|crawlergo|wpscan|nmap|python-requests\/2\.|curl\/7\.(?:[0-5][0-9]|6[0-8])/i;

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "0.0.0.0";
  return ip.slice(0, 64);
}

export function shieldHeaders(request: Request): Record<string, string> {
  return {
    ...securityHeaderMap({ origin: request.headers.get("origin") }),
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export function shieldDeny(status: number, message: string, request: Request): Response {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", ...shieldHeaders(request) } });
}

export function inspectApiRequest(request: Request, opts?: { maxBytes?: number; bucket?: string; max?: number }): Response | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (SCANNER_UA.test(ua)) return shieldDeny(404, "not found", request);

  const origin = request.headers.get("origin");
  if (origin && !isTrustedOrigin(origin) && request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    return shieldDeny(403, "forbidden", request);
  }

  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > (opts?.maxBytes ?? 262_144)) {
    return shieldDeny(413, "payload too large", request);
  }

  const ip = clientIp(request);
  const bucket = opts?.bucket ?? "api";
  const rl = rateLimit(`api:${bucket}:${ip}`, opts?.max ?? 90, 60_000);
  if (!rl.ok) {
    return new Response(rateLimitMessage(rl.retryAfterMs), {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)), ...shieldHeaders(request) },
    });
  }
  return null;
}

export function publicHealthBody(build: string) {
  return { ok: true, app: "norf", build, ts: new Date().toISOString() };
}

export function cronHealthAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const header = request.headers.get("x-cron-secret") ?? "";
  return safeEqual(token, secret) || safeEqual(header, secret);
}
