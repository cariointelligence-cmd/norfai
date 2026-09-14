/**
 * Search job budget. A 300-company run must not fan out into thousands of
 * crawl jobs. Enrich + harvest already read contact pages in-process.
 * A crawl job never enqueues another crawl job.
 */
export const SEARCH_WATCHDOG_MS = 20 * 60 * 1000;

const FANOUT_PATHS_NORMAL = ["/yhteystiedot", "/fi/yhteystiedot", "/contact", "/yhteydenotto", "/contact-us", "/tiimi", "/johto", "/meista", "/about", "/ota-yhteytta"];
const FANOUT_PATHS_DEEP = ["/yhteystiedot", "/contact", "/meista", "/about", "/tiimi", "/team", "/johto", "/contact-us", "/henkilosto", "/yritys", "/ota-yhteytta"];
const FANOUT_PATHS_HIRING = ["/tyopaikat", "/careers", "/jobs", "/ura", "/avoimet-tyopaikat", "/open-positions"];

export function crawlCap(depth?: string | null): number {
  return String(depth ?? "") === "deep" ? 8 : 4;
}

export function contactsSatisfied(input: {
  email?: string | null;
  phone?: string | null;
  people?: number | null;
}): boolean {
  const email = typeof input.email === "string" && input.email.trim().length > 3;
  const phone = typeof input.phone === "string" && input.phone.trim().length > 5;
  const people = Number(input.people ?? 0) > 0;
  return Boolean(email && (phone || people));
}

export function shouldEnqueueCrawl(opts: {
  website?: string | null;
  existingCrawlJobs: number;
  cap: number;
  satisfied: boolean;
  wantHiring?: boolean;
}): boolean {
  if (!opts.website) return false;
  if (opts.satisfied && !opts.wantHiring) return false;
  if (opts.existingCrawlJobs >= Math.max(1, opts.cap)) return false;
  return true;
}

/** Child crawl jobs are banned. Extra contact pages run inside the seed job. */
export function shouldSpawnChildCrawls(): boolean {
  return false;
}

export function isChildCrawlPayload(payload: { seed?: unknown } | null | undefined): boolean {
  return payload?.seed !== true;
}

export function remainingCrawlSlots(existingJobs: number, cap: number): number {
  return Math.max(0, Math.max(1, cap) - Math.max(0, existingJobs));
}

export function inProcessFollowCount(opts: { seed: boolean; satisfied: boolean; depth?: string | null; wantHiring?: boolean }): number {
  if (!opts.seed) return 0;
  const deep = String(opts.depth ?? "") === "deep";
  const contact = opts.satisfied ? 0 : deep ? 3 : 2;
  const hiring = opts.wantHiring ? 2 : 0;
  return contact + hiring;
}

export function canonicalCrawlUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.replace(/^www\./i, "").toLowerCase();
    u.pathname = (u.pathname.replace(/\/+$/, "") || "/") ;
    return u.toString();
  } catch {
    return null;
  }
}

export function pickFanOutUrls(opts: {
  origin: string;
  already: Iterable<string>;
  slots: number;
  depth?: string | null;
  wantHiring?: boolean;
  hiringOnly?: boolean;
}): string[] {
  const slots = Math.max(0, Math.floor(opts.slots));
  if (slots <= 0) return [];
  let origin: URL;
  try {
    origin = new URL(opts.origin);
  } catch {
    return [];
  }
  const seen = new Set<string>();
  for (const raw of opts.already) {
    const c = canonicalCrawlUrl(raw);
    if (c) seen.add(c);
  }
  const contact = String(opts.depth ?? "") === "deep" ? FANOUT_PATHS_DEEP : FANOUT_PATHS_NORMAL;
  const paths = opts.hiringOnly
    ? FANOUT_PATHS_HIRING
    : opts.wantHiring
      ? [...contact, ...FANOUT_PATHS_HIRING]
      : contact;
  const out: string[] = [];
  for (const path of paths) {
    if (out.length >= slots) break;
    try {
      const next = canonicalCrawlUrl(new URL(path, origin).toString());
      if (!next || seen.has(next)) continue;
      seen.add(next);
      out.push(next);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function shouldFanOutCrawl(opts: {
  pagesSeen: number;
  cap: number;
  satisfied: boolean;
}): boolean {
  if (opts.satisfied) return false;
  return opts.pagesSeen < Math.max(1, opts.cap);
}

export function shouldSkipScrape(opts: { website?: string | null; websiteUsable: boolean }): boolean {
  return Boolean(opts.website) && opts.websiteUsable;
}

export function shouldEnqueueSignals(depth?: string | null): boolean {
  return String(depth ?? "") === "deep";
}

/** After enrich/scrape are done, leftover crawls/signals must not hold the run open. */
export function shouldDrainOptionalJobs(opts: {
  enrichLive: boolean;
  scrapeLive: boolean;
  discoverLive: boolean;
  ageMs: number;
  watchdogMs?: number;
}): boolean {
  if (opts.enrichLive || opts.discoverLive) return false;
  return opts.ageMs >= (opts.watchdogMs ?? SEARCH_WATCHDOG_MS);
}

export function isCoreJobType(type: string | null | undefined): boolean {
  const t = String(type ?? "");
  return t === "discover" || t === "enrich" || t === "scrape" || t === "score";
}
