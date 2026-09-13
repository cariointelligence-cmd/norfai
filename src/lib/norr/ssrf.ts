import { isIP } from "node:net";
import dns from "node:dns/promises";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata",
  "metadata.aws.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
  "ip-169-254-169-254.ec2.internal",
  "0.0.0.0",
]);

let ssrfBlocks = 0;
export function ssrfBlockCount(): number {
  return ssrfBlocks;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!base || Number.isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const V4_BLOCKS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

function isBlockedIpv4(ip: string): boolean {
  return V4_BLOCKS.some((c) => inCidr(ip, c));
}

function ipv4FromHexPair(hi: string, lo: string): string | null {
  const a = Number.parseInt(hi, 16);
  const b = Number.parseInt(lo, 16);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const n = ((a << 16) + b) >>> 0;
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

function embeddedIpv4(ip: string): string | null {
  const n = ip.toLowerCase();
  const dotted = n.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1]) return dotted[1];
  const hexMapped = n.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped?.[1] && hexMapped[2]) return ipv4FromHexPair(hexMapped[1], hexMapped[2]);
  const nat64Dotted = n.match(/^64:ff9b::(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (nat64Dotted?.[1]) return nat64Dotted[1];
  const nat64Hex = n.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64Hex?.[1] && nat64Hex[2]) return ipv4FromHexPair(nat64Hex[1], nat64Hex[2]);
  const sixFour = n.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/);
  if (sixFour?.[1] && sixFour[2]) return ipv4FromHexPair(sixFour[1], sixFour[2]);
  return null;
}

function isBlockedIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1" || n === "::") return true;
  if (n.startsWith("fe80:") || n.startsWith("fc") || n.startsWith("fd")) return true;
  if (n.startsWith("ff")) return true;
  if (n.startsWith("2001:db8:")) return true;
  const embedded = embeddedIpv4(n);
  if (embedded && isIP(embedded) === 4) return isBlockedIpv4(embedded);
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const ver = isIP(ip);
  if (ver === 4) return isBlockedIpv4(ip);
  if (ver === 6) return isBlockedIpv6(ip);
  return true;
}

function ipv4FromDecimalHost(host: string): string | null {
  if (!/^\d+$/.test(host)) return null;
  const n = Number(host);
  if (!Number.isSafeInteger(n) || n < 0 || n > 4294967295) return null;
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

function dottedFromDashHost(host: string): string | null {
  const m = host.match(/^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})(?:\.|$)/);
  if (!m) return null;
  const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  return isIP(ip) === 4 ? ip : null;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function reject(message: string): never {
  ssrfBlocks += 1;
  throw new UnsafeUrlError(message);
}

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    reject("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    reject("Only http and https are allowed");
  }
  if (url.username || url.password) {
    reject("URLs with credentials are blocked");
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!host) reject("Missing host");
  if (BLOCKED_HOSTS.has(host)) reject("Blocked host");
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host.endsWith(".lan") ||
    host.endsWith(".corp")
  ) {
    reject("Blocked host suffix");
  }
  if (host === "169.254.169.254" || host.endsWith(".169.254.169.254")) {
    reject("Link-local metadata endpoint is blocked");
  }
  if (host.endsWith(".nip.io") || host.endsWith(".sslip.io") || host.endsWith(".localtest.me")) {
    const dashed = dottedFromDashHost(host);
    if (dashed && isBlockedIp(dashed)) reject("Private IP encoded in hostname is blocked");
  }
  const decimal = ipv4FromDecimalHost(host);
  if (decimal) {
    if (isBlockedIp(decimal)) reject("Private or reserved IP is blocked");
    return url;
  }
  if (isIP(host)) {
    if (isBlockedIp(host)) reject("Private or reserved IP is blocked");
    return url;
  }
  let addrs: string[] = [];
  try {
    const resolved = await dns.lookup(host, { all: true, verbatim: true });
    addrs = resolved.map((r) => r.address);
  } catch {
    reject("DNS lookup failed");
  }
  if (!addrs.length) reject("DNS lookup returned no addresses");
  for (const ip of addrs) {
    if (isBlockedIp(ip)) reject("Host resolves to a private or reserved address");
  }
  return url;
}

export const FETCH_UA =
  "NorfIntel/1.0 (+https://norf.local; B2B public-register research; respects robots.txt)";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ALLOWED_CONTENT = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/(json|xml|rss\+xml|atom\+xml)|text\/xml)/i;
const BLOCKED_CONTENT = /^(application\/zip|application\/x-zip|application\/x-msdownload|application\/octet-stream|application\/x-executable|application\/pdf|multipart\/)/i;

export function contentTypeAllowed(contentType: string | null, mode: "html" | "any" = "html"): boolean {
  if (!contentType) return mode === "html";
  const ct = contentType.split(";")[0]!.trim();
  if (BLOCKED_CONTENT.test(ct)) return false;
  if (mode === "any") return true;
  return ALLOWED_CONTENT.test(ct);
}

export async function safeFetch(
  raw: string,
  init: RequestInit & { timeoutMs?: number; maxBytes?: number; requireHtml?: boolean } = {},
): Promise<{ url: string; status: number; headers: Headers; body: string }> {
  const timeoutMs = init.timeoutMs ?? 10000;
  const maxBytes = init.maxBytes ?? 1_500_000;
  let current = raw;
  for (let hop = 0; hop < 5; hop += 1) {
    const url = await assertSafeUrl(current);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const extra = (init.headers as Record<string, string> | undefined) ?? {};
      const res = await fetch(url.toString(), {
        method: init.method ?? "GET",
        headers: {
          Accept: extra.Accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
          "User-Agent": extra["User-Agent"] ?? FETCH_UA,
          ...extra,
        },
        redirect: "manual",
        signal: ctrl.signal,
        body: init.body,
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) reject("Redirect without Location");
        current = new URL(loc, url).toString();
        continue;
      }
      const ct = res.headers.get("content-type");
      const mime = (ct ?? "").split(";")[0]!.trim();
      if (mime && BLOCKED_CONTENT.test(mime)) {
        reject("Blocked content type");
      }
      if (init.requireHtml && !contentTypeAllowed(ct, "html") && res.status < 400) {
        reject("Blocked content type");
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        reject("Response exceeded size limit");
      }
      const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      return { url: url.toString(), status: res.status, headers: res.headers, body };
    } finally {
      clearTimeout(t);
    }
  }
  reject("Too many redirects");
}
