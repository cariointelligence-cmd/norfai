/** First-party visitor engines. Never invent an email or name. */

export const VISITOR_COOKIE = "norf_vid";
const VID_RE = /^[A-Za-z0-9_-]{16,48}$/;

export type DeviceProfile = {
  family: string;
  os: string;
  bot: boolean;
};

export type GeoHint = {
  country: string | null;
  region: string | null;
  city: string | null;
};

export type IdentityClass = "session" | "cookie_linked" | "ip_linked" | "unknown";

export function parseVisitorId(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  return VID_RE.test(v) ? v.slice(0, 48) : null;
}

export function mintVisitorId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function deviceEngine(ua: string): DeviceProfile {
  const raw = ua.slice(0, 400);
  const bot = /bot|spider|crawler|preview|slurp|bingpreview|facebookexternalhit|whatsapp|telegram/i.test(raw);
  let os = "unknown";
  if (/windows/i.test(raw)) os = "Windows";
  else if (/android/i.test(raw)) os = "Android";
  else if (/iphone|ipad|ios/i.test(raw)) os = "iOS";
  else if (/mac os|macintosh/i.test(raw)) os = "macOS";
  else if (/linux/i.test(raw)) os = "Linux";
  let family = "browser";
  if (bot) family = "bot";
  else if (/edg\//i.test(raw)) family = "Edge";
  else if (/chrome|crios/i.test(raw)) family = "Chrome";
  else if (/firefox|fxios/i.test(raw)) family = "Firefox";
  else if (/safari/i.test(raw) && !/chrome/i.test(raw)) family = "Safari";
  return { family, os, bot };
}

export function geoEngine(headers: Headers | Record<string, string | null>): GeoHint {
  const get = (k: string) =>
    headers instanceof Headers ? headers.get(k) : (headers[k] ?? null);
  const country = get("x-vercel-ip-country") || get("cf-ipcountry") || null;
  const region = get("x-vercel-ip-country-region") || null;
  const city = get("x-vercel-ip-city") || null;
  return {
    country: country ? decodeURIComponent(country).slice(0, 8) : null,
    region: region ? decodeURIComponent(region).slice(0, 32) : null,
    city: city ? decodeURIComponent(city).slice(0, 64) : null,
  };
}

export function classifyIdentity(opts: {
  sessionEmail?: string | null;
  sessionName?: string | null;
  cookieEmail?: string | null;
  ipEmail?: string | null;
}): { class: IdentityClass; email: string | null; name: string | null } {
  if (opts.sessionEmail) {
    return { class: "session", email: opts.sessionEmail, name: opts.sessionName || null };
  }
  if (opts.cookieEmail) {
    return { class: "cookie_linked", email: opts.cookieEmail, name: opts.sessionName || null };
  }
  if (opts.ipEmail) {
    return { class: "ip_linked", email: opts.ipEmail, name: null };
  }
  return { class: "unknown", email: null, name: null };
}

export function sanitizePath(raw: unknown): string {
  const s = String(raw ?? "/").trim() || "/";
  if (!s.startsWith("/")) return "/";
  return s.slice(0, 240);
}

export function shouldSkipPath(path: string): boolean {
  return path.startsWith("/api/") || path.startsWith("/__") || path.includes(".");
}

export function visitorCookieHeader(vid: string): string {
  return `${VISITOR_COOKIE}=${vid}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}
