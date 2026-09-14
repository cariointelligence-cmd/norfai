/** Leadership-page crawlers. 12+ per country. Free HTML only. Isolated by nation. */
import type { PersonHit } from "../types.ts";
import { canonicalCompanyWebsite } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { nationOf, type Nation } from "../countries/env.ts";
import { poolMap } from "../engines.ts";
import { extractDecisionMakersFromHtml } from "./dm-extract.ts";
import { countryLinksFromHtml } from "./hypercrawl.ts";

export const DM_PATHS: Record<Nation, string[]> = {
  FI: [
    "/johto", "/fi/johto", "/hallitus", "/management", "/leadership",
    "/yritys/johto", "/en/management", "/paattajat", "/avainhenkilot",
    "/organisaatio", "/about/management", "/company/management",
  ],
  SE: [
    "/ledning", "/ledningen", "/styrelsen", "/vd", "/management",
    "/om-oss/ledning", "/sv/ledning", "/foretaget/ledning",
    "/investor/governance", "/om-oss/styrelsen", "/en/management", "/kontakt/vd",
  ],
  NO: [
    "/ledelsen", "/ledelse", "/styret", "/management", "/om-oss/ledelsen",
    "/daglig-leder", "/organisation", "/about/management",
    "/investor", "/om-oss/styret", "/en/management", "/kontakt",
  ],
};

const DM_HREF = /johto|hallitus|ledning|styrelse|ledelse|styret|management|leadership|governance|paattaj|organisa|yhteystiedot|kontakt|contact|team|tiimi|medarbet|ansatte/i;

function originOf(website?: string | null): string | null {
  const w = canonicalCompanyWebsite(website ?? null);
  if (!w) return null;
  try { return new URL(w).origin; } catch { return null; }
}

async function html(url: string, nation: Nation): Promise<string | null> {
  const lang = nation === "SE" ? "sv-SE,sv;q=0.9" : nation === "NO" ? "nb-NO,nb;q=0.9" : "fi-FI,fi;q=0.9";
  try {
    const res = await safeFetch(url, {
      timeoutMs: 1400,
      maxBytes: 140_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html", "Accept-Language": lang },
    });
    if (res.status >= 400 || res.body.length < 80) return null;
    return res.body;
  } catch { return null; }
}

export async function runDecisionMakerFleet(opts: {
  website?: string | null;
  country?: string | null;
}): Promise<{ people: PersonHit[]; pages: string[] }> {
  const nation = nationOf(opts.country);
  const origin = originOf(opts.website);
  if (!origin) return { people: [], pages: [] };
  const home = await html(origin, nation);
  const discovered = home ? countryLinksFromHtml(home, origin, nation).filter((u) => DM_HREF.test(u)) : [];
  const fallbacks = DM_PATHS[nation].map((p) => origin + p);
  const urls: string[] = [];
  const seenU = new Set([origin]);
  for (const u of [...discovered, ...fallbacks]) {
    if (seenU.has(u) || urls.length >= 8) continue;
    seenU.add(u);
    urls.push(u);
  }
  const people: PersonHit[] = [];
  const used: string[] = [];
  const seen = new Set<string>();
  const take = (list: PersonHit[], page: string) => {
    used.push(page);
    for (const p of list) {
      const k = p.fullName.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      people.push(p);
    }
  };
  if (home) take(extractDecisionMakersFromHtml(home, origin, nation), origin);
  const pages = await poolMap(urls, 5, async (u) => {
    const body = await html(u, nation);
    return body ? { u, body } : null;
  });
  for (const row of pages) {
    if (!row) continue;
    take(extractDecisionMakersFromHtml(row.body, row.u, nation), row.u);
    if (people.some((p) => p.workEmail)) break;
  }
  return { people: people.slice(0, 8), pages: used };
}

export function dmPathCount(): { FI: number; SE: number; NO: number } {
  return { FI: DM_PATHS.FI.length, SE: DM_PATHS.SE.length, NO: DM_PATHS.NO.length };
}
