const SUFFIXES = [
  "osakeyhtiö", "oyj", "oy", "abp", "ab", "oy ab", "kb", "ky", "ay",
  "tmi", "toiminimi", "osuuskunta", "osk", "ry", "rf", "as oy", "asunto-osakeyhtiö",
  "limited", "ltd", "plc", "gmbh", "inc", "corp", "corporation", "llc",
  "julkinen osakeyhtiö", "publikt aktiebolag",
];

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeName(name: string): string {
  let s = name.trim().toLowerCase().replace(/\s+/g, " ");
  s = s.replace(/[.,]/g, "");
  s = stripDiacritics(s);
  for (const suf of SUFFIXES) {
    const re = new RegExp(`(^|\\s)${suf}$`, "i");
    s = s.replace(re, "").trim();
  }
  return s;
}

/** Finnish Y-tunnus: 7 digits + checksum. Returns canonical "1234567-8" or null. */
export function normalizeBusinessId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\s/g, "").replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) return null;
  const body = digits.slice(0, 7);
  const check = Number(digits[7]);
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const sum = body.split("").reduce((acc, ch, i) => acc + Number(ch) * weights[i], 0);
  const rem = sum % 11;
  const expected = rem === 0 ? 0 : 11 - rem;
  if (expected === 10 || expected !== check) return null;
  return `${body}-${digits[7]}`;
}

export function businessIdChecksumOk(raw: string): boolean {
  return normalizeBusinessId(raw) !== null;
}

export function toVatId(businessId: string | null): string | null {
  const n = normalizeBusinessId(businessId);
  if (!n) return null;
  return `FI${n.replace("-", "")}`;
}

export function fromVatId(vat: string | null | undefined): string | null {
  if (!vat) return null;
  const m = vat.toUpperCase().replace(/\s/g, "").match(/^FI(\d{8})$/);
  if (!m) return vat.toUpperCase();
  const d = m[1];
  return normalizeBusinessId(`${d.slice(0, 7)}-${d[7]}`);
}

export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  s = s.replace(/:\d+$/, "");
  if (!s || !s.includes(".")) return null;
  if (s.split(".").some((p) => !p)) return null;
  return s;
}

export function normalizeWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

import { isJunkHost } from "./junk-hosts.ts";

const ASSET_HOST = /^(assets|cdn|static|img|images|media|static-assets|fonts|static-cdn|amp)\./i;
const ASSET_PATH = /\.(png|jpe?g|gif|webp|svg|avif|css|js|mjs|woff2?|ttf|eot|ico|map)(\?|$)/i;
const PLATFORM_PATH = /^\/(css2?|gtag\/js|pagead|maps\/api|ajax\/libs)\b/i;

/** Directory cards, CDNs, font APIs, trackers and image URLs are not a company website. */
export function isJunkCompanyWebsite(raw: string | null | undefined): boolean {
  const w = normalizeWebsite(raw);
  if (!w) return true;
  try {
    const u = new URL(w);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (ASSET_HOST.test(host)) return true;
    if (isJunkHost(host)) return true;
    if (ASSET_PATH.test(u.pathname)) return true;
    if (PLATFORM_PATH.test(u.pathname)) return true;
    if (/\/maps(\/|$)/i.test(u.pathname) && /google|goo\.gl/i.test(host)) return true;
    if (host === "maps.app.goo.gl" || /(^|\.)goo\.gl$/i.test(host)) return true;
    if (/[?&]family=/i.test(u.search) && /font/i.test(host + u.pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

/** Prefer the company origin over a location-page, CDN asset, or closed-page URL. */
export function canonicalCompanyWebsite(raw: string | null | undefined): string | null {
  const w = normalizeWebsite(raw);
  if (!w) return null;
  if (isJunkCompanyWebsite(w)) return null;
  try {
    const u = new URL(w);
    if (/closed\.html?$/i.test(u.pathname)) return null;
    if (/\/(sijainti|toimipisteet|toimipiste|offices?|locations?|yksikot)(\/|$)/i.test(u.pathname)) {
      return `${u.protocol}//${u.host}`;
    }
    return w;
  } catch {
    return w;
  }
}

/** True when the stored URL is missing or is a directory/CDN, so enrich must run again. */
export function storedWebsiteUnusable(raw: string | null | undefined): boolean {
  return canonicalCompanyWebsite(raw) == null;
}

export function normalizePhone(raw: string | null | undefined, defaultCountry = "FI"): string | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/[()\s.-]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("0") && defaultCountry === "FI") s = `+358${s.slice(1)}`;
  if (!s.startsWith("+") && /^\d{6,15}$/.test(s) && defaultCountry === "FI") s = `+358${s}`;
  if (!/^\+\d{6,15}$/.test(s)) return null;
  if (s.startsWith("+358")) {
    const rest = s.slice(4);
    if (rest.length < 8 || rest.length > 9) return null;
    if (rest.startsWith("1") && !rest.startsWith("10")) return null;
  }
  return s;
}

export function pickLangText(
  items: Array<{ languageCode?: string; language?: string; description?: string; name?: string; city?: string }> | undefined,
  prefer: string[] = ["3", "1", "2", "en", "fi", "sv"],
): string | null {
  if (!items?.length) return null;
  for (const p of prefer) {
    const hit = items.find((i) => i.languageCode === p || i.language === p);
    const t = hit?.description ?? hit?.name ?? hit?.city;
    if (t) return t;
  }
  return items[0]?.description ?? items[0]?.name ?? items[0]?.city ?? null;
}
