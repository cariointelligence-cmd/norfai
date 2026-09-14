/**
 * Edge shield for /api/*. Session routes still authenticate; this stops
 * unauthenticated scraping, oversized bodies, and secret-leaking health probes.
 */
import { isTrustedOrigin, rateLimit, rateLimitMessage, safeEqual, securityHeaderMap } from "./security.ts";

const SCANNER_UA = /sqlmap|nikto|dirbuster|masscan|zgrab|nuclei|httpx|crawlergo|wpscan|nmap/i;

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

function hasSessionCookie(request: Request): boolean {
  const c = request.headers.get("cookie") ?? "";
  return /better-auth|session_token|__Secure-better-auth/i.test(c);
}

export function inspectApiRequest(request: Request, opts?: { maxBytes?: number; bucket?: string; max?: number }): Response | null {
  const method = request.method.toUpperCase();
  if (method === "TRACE" || method === "TRACK") return shieldDeny(405, "method not allowed", request);

  const ua = request.headers.get("user-agent") ?? "";
  if (SCANNER_UA.test(ua)) return shieldDeny(404, "not found", request);

  const origin = request.headers.get("origin");
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (mutating) {
    if (origin && !isTrustedOrigin(origin)) return shieldDeny(403, "forbidden", request);
    if (site === "cross-site") return shieldDeny(403, "forbidden", request);
  }

  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > (opts?.maxBytes ?? 262_144)) {
    return shieldDeny(413, "payload too large", request);
  }

  const ip = clientIp(request);
  const bucket = opts?.bucket ?? "api";
  const authed = hasSessionCookie(request);
  const max = opts?.max ?? (authed ? 180 : 60);
  const rl = rateLimit(`api:${bucket}:${ip}`, max, 60_000);
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