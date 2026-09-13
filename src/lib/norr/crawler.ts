import {
  extractJsonLd,
  extractLinks,
  extractMeta,
  extractPageContacts,
  extractPeopleFromText,
  detectEcommerce,
  detectHiring,
  detectTechnologies,
  detectLanguage,
  pathPriority,
  stripTags,
} from "./extract.ts";
import { BROWSER_UA, safeFetch } from "./ssrf.ts";
import type { PersonHit } from "./types.ts";
import { analyzeWebsite, type WebsiteIntel } from "./targeting/website.ts";

export type RobotsRules = { fetchable: boolean; delayMs: number; body: string };

export function robotsAgentApplies(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === "*") return true;
  return v.includes("norfintel") || v.includes("norf") || v.includes("norr");
}

export async function readRobots(origin: string): Promise<RobotsRules> {
  try {
    const res = await safeFetch(new URL("/robots.txt", origin).toString(), { timeoutMs: 6000, maxBytes: 200_000 });
    if (res.status >= 400) return { fetchable: true, delayMs: 120, body: "" };
    const body = res.body;
    const lines = body.split(/\r?\n/);
    let applies = false;
    let delay = 1;
    for (const line of lines) {
      const t = line.split("#")[0]!.trim();
      const [k, ...rest] = t.split(":");
      if (!k) continue;
      const v = rest.join(":").trim();
      const key = k.toLowerCase();
      if (key === "user-agent") applies = robotsAgentApplies(v);
      if (!applies) continue;
      if (key === "crawl-delay") delay = Math.max(delay, Number(v) || 1);
    }
    return { fetchable: true, delayMs: Math.min(400, Math.max(50, delay * 80)), body };
  } catch {
    return { fetchable: true, delayMs: 120, body: "" };
  }
}

export function robotsAllows(robotsBody: string, path: string): boolean {
  if (!robotsBody) return true;
  const lines = robotsBody.split(/\r?\n/);
  let applies = false;
  const disallows: string[] = [];
  const allows: string[] = [];
  for (const line of lines) {
    const t = line.split("#")[0]!.trim();
    const [k, ...rest] = t.split(":");
    if (!k) continue;
    const v = rest.join(":").trim();
    const key = k.toLowerCase();
    if (key === "user-agent") applies = robotsAgentApplies(v);
    if (!applies) continue;
    if (key === "disallow") disallows.push(v || "/");
    if (key === "allow") allows.push(v);
  }
  const blocked = disallows.filter(Boolean).some((d) => path.startsWith(d));
  const allowed = allows.filter(Boolean).some((a) => path.startsWith(a));
  if (allowed) return true;
  return !blocked;
}

export type CrawlResult = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
  text: string;
  excerpt: string;
  hash: string;
  language: string;
  meta: Record<string, string>;
  jsonLd: ReturnType<typeof extractJsonLd>;
  links: string[];
  emails: ReturnType<typeof extractPageContacts>["emails"];
  phones: ReturnType<typeof extractPageContacts>["phones"];
  people: PersonHit[];
  technologies: string[];
  quality: WebsiteIntel;
  ecommerce: boolean;
  hiring: boolean;
  error?: string;
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function crawlPage(url: string, roles: string[] = []): Promise<CrawlResult> {
  const res = await safeFetch(url, {
    timeoutMs: 7000,
    maxBytes: 1_500_000,
    requireHtml: true,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "User-Agent": BROWSER_UA,
    },
  });
  const html = res.body;
  const text = stripTags(html);
  const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 800);

  let engineEmails: string[] = [];
  let enginePhones: string[] = [];
  try {
    const { extractViaEngine, fingerprintNative } = await import("./engines.ts");
    void fingerprintNative(html);
    const native = await extractViaEngine(html);
    if (native?.ok) {
      engineEmails = native.emails;
      enginePhones = native.phones;
    }
  } catch {
    /* TS extract remains canonical if the daemon is down */
  }

  const hash = await sha256(html);
  const language = detectLanguage(text);
  const meta = extractMeta(html);
  const jsonLd = extractJsonLd(html);
  const links = extractLinks(html, res.url);
  const contacts = extractPageContacts(html, res.url);
  for (const e of engineEmails) {
    if (!contacts.emails.some((x) => x.value === e) && e.includes("@")) {
      contacts.emails.push({ value: e, classification: "published" });
    }
  }
  for (const p of enginePhones) {
    if (!contacts.phones.some((x) => x.value === p)) contacts.phones.push({ value: p });
  }
  const extracted = extractPeopleFromText(text, res.url, roles);
  const people: PersonHit[] = extracted.map((p) => ({
    fullName: p.fullName,
    title: p.title,
    seniority: p.seniority,
    sourcePage: p.sourcePage,
    workEmail: p.workEmail ?? null,
    workPhone: p.workPhone ?? null,
    evidence: p.evidence,
    confidence: p.confidence,
  }));
  const technologies = detectTechnologies(html, res.headers);
  const intel = analyzeWebsite({ html, url: res.url, status: res.status, headers: res.headers });
  const quality: WebsiteIntel = intel;
  return {
    url,
    finalUrl: res.url,
    status: res.status,
    contentType: res.headers.get("content-type"),
    html,
    text,
    excerpt,
    hash,
    language,
    meta,
    jsonLd,
    links,
    emails: contacts.emails,
    phones: contacts.phones,
    people,
    technologies,
    quality,
    ecommerce: detectEcommerce(html),
    hiring: detectHiring(text),
  };
}

export async function discoverSitemapUrls(origin: string, limit = 4): Promise<string[]> {
  const out: string[] = [];
  try {
    const res = await safeFetch(new URL("/sitemap.xml", origin).toString(), {
      timeoutMs: 5000,
      maxBytes: 400_000,
    });
    if (res.status >= 400) return [];
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let m: RegExpExecArray | null;
    const scored: Array<{ url: string; score: number }> = [];
    while ((m = re.exec(res.body))) {
      try {
        const u = new URL(m[1]!, origin);
        if (u.origin !== new URL(origin).origin) continue;
        scored.push({ url: u.toString(), score: pathPriority(u.pathname) });
      } catch {
        continue;
      }
    }
    scored.sort((a, b) => a.score - b.score);
    for (const row of scored) {
      if (out.length >= limit) break;
      if (!out.includes(row.url)) out.push(row.url);
    }
  } catch {
    return [];
  }
  return out;
}

export function pickNextUrls(host: string, links: string[], already: Set<string>, n: number): string[] {
  const needle = host.replace(/^www\./, "").toLowerCase();
  const scored: Array<{ url: string; score: number }> = [];
  const seen = new Set(already);
  for (const link of links) {
    try {
      const u = new URL(link);
      if (u.hostname.replace(/^www\./, "").toLowerCase() !== needle) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i.test(u.pathname)) continue;
      if (seen.has(u.toString())) continue;
      seen.add(u.toString());
      scored.push({ url: u.toString(), score: pathPriority(u.pathname) });
    } catch {
      continue;
    }
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, Math.max(0, n)).map((r) => r.url);
}
