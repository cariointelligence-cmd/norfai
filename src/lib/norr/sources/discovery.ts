import type { DiscoveredCompany } from "../types.ts";
import { normalizeDomain, normalizeName, normalizeWebsite } from "../normalize.ts";
import { gleifSearch, wikidataNameSearch } from "./open.ts";
import { duckDuckGoHtmlSearch, isDirectoryHost, pageMentionsCompany } from "./webdiscover.ts";
import { expandSearchQueries } from "./queries.ts";

function mergeDiscovered(rows: DiscoveredCompany[]): DiscoveredCompany[] {
  const byKey = new Map<string, DiscoveredCompany>();
  for (const row of rows) {
    if (!row.name?.trim()) continue;
    const domain = normalizeDomain(row.website ?? null);
    const key = (row.lei || row.businessId || `${normalizeName(row.name)}|${domain ?? row.country}`).toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row, website: normalizeWebsite(row.website ?? null) });
      continue;
    }
    byKey.set(key, {
      ...prev,
      businessId: prev.businessId ?? row.businessId ?? null,
      vatId: prev.vatId ?? row.vatId ?? null,
      lei: prev.lei ?? row.lei ?? null,
      website: prev.website ?? normalizeWebsite(row.website ?? null),
      street: prev.street ?? row.street ?? null,
      municipality: prev.municipality ?? row.municipality ?? null,
      legalForm: prev.legalForm ?? row.legalForm ?? null,
      businessStatus: prev.businessStatus ?? row.businessStatus ?? null,
      tradingNames: [...new Set([...(prev.tradingNames ?? []), ...(row.tradingNames ?? [])])],
    });
  }
  const merged = [...byKey.values()];
  for (const site of merged) {
    if (!site.website || site.lei || site.businessId) continue;
    const core = normalizeName(site.name);
    if (core.length < 4) continue;
    const host = normalizeDomain(site.website);
    for (const row of merged) {
      if (row === site || row.website) continue;
      const other = normalizeName(row.name);
      if (other.includes(core) || core.includes(other.slice(0, Math.min(12, other.length)))) {
        if (host && (other.includes(core) || host.replace(/\.[a-z]+$/i, "").includes(core.slice(0, 8)))) {
          row.website = site.website;
        }
      }
    }
  }
  return merged.filter((row, i, all) => {
    if (row.lei || row.businessId) return true;
    const core = normalizeName(row.name);
    const host = normalizeDomain(row.website ?? null);
    return !all.some((other, j) => j !== i && (other.lei || other.businessId) && normalizeName(other.name).includes(core) && (!host || normalizeDomain(other.website ?? null) === host));
  });
}

async function webNameSearch(name: string, country: string, depth: "normal" | "deep"): Promise<DiscoveredCompany[]> {
  const queries = expandSearchQueries({ name, country, depth }).slice(0, depth === "deep" ? 6 : 3);
  const settled = await Promise.allSettled(queries.map((q) => duckDuckGoHtmlSearch(q, 8000)));
  const companies: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    for (const hit of item.value.hits) {
      if (isDirectoryHost(hit.url)) continue;
      if (!pageMentionsCompany(`${hit.title} ${hit.snippet}`, name, hit.title)) continue;
      let host = "";
      try {
        host = new URL(hit.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        continue;
      }
      if (!host || seen.has(host)) continue;
      seen.add(host);
      const website = normalizeWebsite(hit.url);
      companies.push({
        name,
        country: country === "EU" ? "EU" : country,
        website,
      });
      if (companies.length >= (depth === "deep" ? 8 : 5)) return companies;
    }
  }
  return companies;
}

export async function federatedCompanySearch(opts: {
  name: string;
  country: string;
  max: number;
  depth?: "normal" | "deep";
}): Promise<{
  companies: DiscoveredCompany[];
  report: Array<{ source: string; ok: boolean; hits: number; error?: string; note?: string }>;
}> {
  const depth = opts.depth === "deep" ? "deep" : "normal";
  const country = opts.country || "FI";
  const gleifCountry = country === "EU" ? undefined : country;
  const [gl, wd, web] = await Promise.allSettled([
    gleifSearch(opts.name, gleifCountry),
    wikidataNameSearch(opts.name, country),
    webNameSearch(opts.name, country, depth),
  ]);
  const report: Array<{ source: string; ok: boolean; hits: number; error?: string; note?: string }> = [];
  const rows: DiscoveredCompany[] = [];

  if (gl.status === "fulfilled") {
    report.push({ source: "gleif", ok: gl.value.ok, hits: gl.value.ok ? gl.value.data.length : 0, error: gl.value.ok ? undefined : gl.value.error });
    if (gl.value.ok) rows.push(...gl.value.data);
  } else {
    report.push({ source: "gleif", ok: false, hits: 0, error: gl.reason instanceof Error ? gl.reason.message : "gleif failed" });
  }

  if (wd.status === "fulfilled") {
    report.push({
      source: "wikidata",
      ok: wd.value.ok,
      hits: wd.value.ok ? wd.value.data.length : 0,
      error: wd.value.ok ? undefined : wd.value.error,
      note: "Supporting entity resolution, not a trade register",
    });
    if (wd.value.ok) rows.push(...wd.value.data);
  } else {
    report.push({ source: "wikidata", ok: false, hits: 0, error: wd.reason instanceof Error ? wd.reason.message : "wikidata failed" });
  }

  if (web.status === "fulfilled") {
    report.push({ source: "duckduckgo", ok: true, hits: web.value.length, note: "Website candidates only when the snippet names the company" });
    rows.push(...web.value);
  } else {
    report.push({ source: "duckduckgo", ok: false, hits: 0, error: web.reason instanceof Error ? web.reason.message : "web discovery failed" });
  }

  return { companies: mergeDiscovered(rows).slice(0, Math.max(1, opts.max)), report };
}
