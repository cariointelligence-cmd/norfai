/**
 * Homemade register / directory discovery on top of official YTJ (and peers).
 * Hits without an official identity are hydrated, then the criteria gate decides.
 * Directories never invent companies, industry codes or Y-tunnus values.
 */
import type { DiscoveredCompany, SearchCriteria } from "../types.ts";
import { isHousingCompany } from "../finland.ts";
import { poolMap } from "../engines.ts";
import { RUNTIME } from "../runtime.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import {
  acceptDiscovered,
  bidFromKauppalehtiUrl,
  bidFromSnippet,
  looksLikeCompanyName,
  mergeOfficial,
  naceFromTol,
  namesCompatible,
  needsOfficialIndustry,
  parseKauppalehtiSearchHtml,
} from "./register-gate.ts";
import { finderDiscover } from "./finder.ts";
import { bolagsverketSearch, companiesHousePublic, openCorporatesPublic } from "./homemade.ts";
import { brregFetchById, brregIndustrySearch, brregSearch, cvrFetchByVat, cvrSearch, gleifSearch, nominatimCompanySearch, wikidataDiscover } from "./open.ts";
import { ytjFetchById, ytjFetchByName } from "./ytj.ts";
import { duckDuckGoHtmlSearch } from "./webdiscover.ts";
import { normalizeName } from "../normalize.ts";
import { asiakastietoDiscover, proffDiscover } from "./proff.ts";
import {
  createCircuit,
  diagnoseRegisterEmpty,
  planRegisterQuery,
  REGISTER_PARSER_VERSION,
  routeHomemadeSources,
  type RegisterQueryPlan,
} from "./register-plan.ts";

export type HomemadeHit = {
  company: DiscoveredCompany;
  sourceId: string;
  reasons: string[];
};

export type HomemadeDiscoverReport = {
  source: string;
  ok: boolean;
  hits: number;
  hydrated?: number;
  dropped?: number;
  error?: string;
  note?: string;
  parserVersion?: string;
};

type RawHit = { row: DiscoveredCompany; sourceId: string };

function skipKeyOf(row: DiscoveredCompany): string[] {
  const keys: string[] = [];
  if (row.businessId) keys.push(row.businessId);
  if (row.name) keys.push(row.name);
  const n = normalizeName(row.name ?? "");
  if (n) keys.push(n);
  return keys;
}

function alreadySeen(row: DiscoveredCompany, skip: Set<string>): boolean {
  return skipKeyOf(row).some((k) => skip.has(k));
}

function ocJurisdiction(country: string): string {
  const c = country.toUpperCase();
  if (c === "GB" || c === "UK") return "gb";
  if (c === "EU") return "fi";
  return (c || "FI").slice(0, 2).toLowerCase();
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string> {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: 800_000,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
      },
    });
    if (res.status >= 400) return "";
    return res.body;
  } catch {
    return "";
  }
}

function northdataFromSearch(url: string, title: string, snippet: string): DiscoveredCompany | null {
  if (!/northdata\.(?:com|de|fi)/i.test(url)) return null;
  const blob = `${title} ${snippet} ${url}`;
  const bid = bidFromSnippet(blob);
  const name = title
    .replace(/\s*[|/].*$/, "")
    .replace(/\s*[-–].*$/, "")
    .replace(/\bPRH\s+\d{7}-\d\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length < 2) return null;
  if (/north data|login|register/i.test(name)) return null;
  return { name, businessId: bid, country: "FI", website: null };
}

async function kauppalehtiDiscover(query: string, max: number): Promise<DiscoveredCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  const push = (row: DiscoveredCompany) => {
    const key = row.businessId || normalizeName(row.name);
    if (!key || seen.has(key) || row.name.length < 2) return;
    seen.add(key);
    out.push(row);
  };
  const ddg = await duckDuckGoHtmlSearch(`site:kauppalehti.fi/yritykset/yritys ${q}`, 5000).catch(() => ({
    hits: [] as Array<{ url: string; title: string; snippet: string }>,
  }));
  for (const hit of ddg.hits) {
    if (!/kauppalehti\.fi\/yritykset\/yritys/i.test(hit.url)) continue;
    const bid = bidFromKauppalehtiUrl(hit.url) ?? bidFromSnippet(`${hit.title} ${hit.snippet}`);
    const name = hit.title.replace(/\s*[|/].*$/, "").replace(/\s+/g, " ").trim();
    if (name) push({ name, businessId: bid, country: "FI", website: null });
    if (out.length >= max) return out;
  }
  if (out.length) return out;
  const html = await fetchHtml(`https://www.kauppalehti.fi/yrityshaku?q=${encodeURIComponent(q)}`, 7000);
  if (html) for (const row of parseKauppalehtiSearchHtml(html)) push(row);
  return out.slice(0, max);
}

async function northdataDiscover(query: string, max: number): Promise<DiscoveredCompany[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const ddg = await duckDuckGoHtmlSearch(`site:northdata.com ${q} Finland PRH`, 5000).catch(() => ({
    hits: [] as Array<{ url: string; title: string; snippet: string }>,
  }));
  const out: DiscoveredCompany[] = [];
  const seen = new Set<string>();
  for (const hit of ddg.hits) {
    const row = northdataFromSearch(hit.url, hit.title, hit.snippet);
    if (!row) continue;
    const key = row.businessId || normalizeName(row.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

async function hydrateOfficial(row: DiscoveredCompany, country: string): Promise<DiscoveredCompany> {
  const bid = (row.businessId ?? "").trim();
  const home = (row.country || country || "FI").toUpperCase();
  try {
    if (bid) {
      if (home === "FI") {
        const r = await ytjFetchById(bid);
        if (r.ok) return mergeOfficial(row, r.data);
        return row;
      }
      if (home === "NO") {
        const r = await brregFetchById(bid);
        if (r.ok) return mergeOfficial(row, r.data);
        return row;
      }
      if (home === "DK") {
        const r = await cvrFetchByVat(bid);
        if (r.ok) return mergeOfficial(row, r.data);
        return row;
      }
      return row;
    }
    if (home === "FI" && looksLikeCompanyName(row.name)) {
      const r = await ytjFetchByName(row.name);
      if (r.ok && namesCompatible(row.name, r.data.name)) return mergeOfficial(row, r.data);
    }
  } catch {
    return row;
  }
  return row;
}

function collectorNote(source: string, country: string): string | undefined {
  if (source === "finder" || source === "kauppalehti" || source === "northdata" || source === "proff" || source === "asiakastieto") {
    return "Directory listing; official YTJ record wins after hydrate";
  }
  if (source === "wikidata") return "Wikidata P3608 VAT → Y-tunnus. Distinctive names only.";
  if (source === "nominatim") return "OSM POI names; official YTJ hydrate required before the industry gate";
  if (source === "gleif") return "GLEIF only for distinctive company names, never industry labels";
  if (source === "brreg") return country === "NO" ? "Brønnøysund NACE / name; client-side poststed filter" : undefined;
  return undefined;
}

export function homemadePlanOf(criteria: SearchCriteria): RegisterQueryPlan {
  return planRegisterQuery(criteria);
}

export async function homemadeRegisterDiscover(opts: {
  criteria: SearchCriteria;
  max: number;
  skipKeys?: Set<string>;
  deadline?: number;
  disabled?: Set<string>;
}): Promise<{ companies: HomemadeHit[]; report: HomemadeDiscoverReport[]; plan: RegisterQueryPlan }> {
  const criteria = opts.criteria;
  const plan = planRegisterQuery(criteria);
  const country = plan.country;
  const cap = Math.min(Math.max(1, opts.max), RUNTIME.homemadeDiscoverCap);
  const per = Math.min(16, Math.max(4, cap));
  const nameQueries = plan.should.nameSeeds;
  const directoryQueries = plan.should.directorySeeds;
  const industries = plan.must.industryCodes;
  const mun = plan.must.municipality ?? "";
  const skip = opts.skipKeys ?? new Set<string>();
  const routed = routeHomemadeSources(plan, opts.disabled);
  const allow = (id: string) => routed.includes(id);
  const report: HomemadeDiscoverReport[] = [];
  const raw: RawHit[] = [];
  const timedOut = () => Boolean(opts.deadline && Date.now() > opts.deadline);
  const circuit = createCircuit(2);

  const collectors: Array<() => Promise<{ source: string; rows: DiscoveredCompany[]; error?: string }>> = [];
  const runQueries = async (
    source: string,
    queries: string[],
    fn: (q: string) => Promise<DiscoveredCompany[]>,
    take = 3,
  ) => {
    const rows: DiscoveredCompany[] = [];
    for (const q of queries.slice(0, take)) {
      if (timedOut() || circuit.tripped(source)) break;
      try {
        rows.push(...(await fn(q)));
        circuit.success(source);
      } catch (err) {
        circuit.fail(source);
        if (circuit.tripped(source)) {
          return { source, rows: rows.slice(0, per), error: err instanceof Error ? err.message : "collector failed" };
        }
      }
      if (rows.length >= per) break;
    }
    return { source, rows: rows.slice(0, per) };
  };

  if (country === "FI" && directoryQueries.length) {
    if (allow("finder")) collectors.push(() => runQueries("finder", directoryQueries, async (q) => {
      const fd = await finderDiscover({ keyword: q, municipality: mun || null, max: per });
      return fd.companies;
    }, 4));
    if (allow("kauppalehti")) collectors.push(() => runQueries("kauppalehti", directoryQueries, (q) => kauppalehtiDiscover(q, per), 3));
    if (allow("northdata")) collectors.push(() => runQueries("northdata", directoryQueries, (q) => northdataDiscover(q, per), 3));
    if (allow("proff")) collectors.push(() => runQueries("proff", directoryQueries, (q) => proffDiscover(q, per), 3));
    if (allow("asiakastieto")) collectors.push(() => runQueries("asiakastieto", nameQueries.length ? nameQueries : directoryQueries, (q) => asiakastietoDiscover(q, per), 3));
  }

  if (allow("nominatim") && mun && directoryQueries.length) {
    collectors.push(() => runQueries("nominatim", directoryQueries.slice(0, 2), async (q) => {
      const r = await nominatimCompanySearch(q, mun, per);
      return r.ok ? r.data : [];
    }, 2));
  }

  if (nameQueries.length && allow("opencorporates")) {
    collectors.push(() => runQueries("opencorporates", nameQueries, async (q) => {
      const r = await openCorporatesPublic(q, ocJurisdiction(country));
      return r.ok ? r.data : [];
    }, 3));
  }

  if (nameQueries.length && allow("wikidata")) {
    collectors.push(() => runQueries("wikidata", nameQueries, async (q) => {
      const r = await wikidataDiscover({ query: q, country, municipality: mun || null, max: per });
      return r.ok ? r.data : [];
    }, 2));
  }

  if (country === "NO" && allow("brreg")) {
    collectors.push(async () => {
      const rows: DiscoveredCompany[] = [];
      for (const code of industries.slice(0, 6)) {
        if (timedOut() || circuit.tripped("brreg")) break;
        const nace = naceFromTol(code);
        if (!nace) continue;
        const r = await brregIndustrySearch(nace, mun || null);
        if (r.ok) {
          rows.push(...r.data);
          circuit.success("brreg");
        } else circuit.fail("brreg");
        if (rows.length >= per) break;
      }
      for (const q of nameQueries.slice(0, 3)) {
        if (timedOut() || rows.length >= per || circuit.tripped("brreg")) break;
        const r = await brregSearch(q);
        if (r.ok) rows.push(...r.data);
      }
      return { source: "brreg", rows: rows.slice(0, per) };
    });
  }

  if (country === "DK" && nameQueries.length && allow("cvr")) {
    collectors.push(() => runQueries("cvr", nameQueries, async (q) => {
      const r = await cvrSearch(q);
      return r.ok ? r.data : [];
    }, 4));
  }

  if (country === "SE" && directoryQueries.length && allow("bolagsverket")) {
    collectors.push(() => runQueries("bolagsverket", directoryQueries, async (q) => {
      const r = await bolagsverketSearch(q);
      return r.ok ? r.data : [];
    }, 3));
  }

  if ((country === "GB" || country === "UK") && nameQueries.length && allow("companies_house")) {
    collectors.push(() => runQueries("companies_house", nameQueries, async (q) => {
      const r = await companiesHousePublic(q);
      return r.ok ? r.data : [];
    }, 3));
  }

  if (plan.federated.includes("gleif") && nameQueries.length && !opts.disabled?.has("gleif")) {
    for (const q of nameQueries.slice(0, 2)) {
      const name = q;
      collectors.push(async () => {
        if (timedOut() || circuit.tripped("gleif")) return { source: "gleif", rows: [] };
        const r = await gleifSearch(name, country === "EU" ? undefined : country);
        if (!r.ok) circuit.fail("gleif");
        else circuit.success("gleif");
        return { source: "gleif", rows: r.ok ? r.data : [], error: r.ok ? undefined : r.error };
      });
    }
  }

  if (!collectors.length) {
    report.push({
      source: "homemade_register",
      ok: true,
      hits: 0,
      note: "No distinctive seeds. Generic queries like yritys are never sent.",
    });
    const diag = diagnoseRegisterEmpty(plan, report, { kept: 0, want: cap });
    if (diag) report.push({ source: "register_plan", ok: true, hits: 0, code: diag.code, note: `${diag.code}: ${diag.text}` });
    return { companies: [], report, plan };
  }

  const settled = await Promise.all(
    collectors.map(async (fn) => {
      try {
        return await fn();
      } catch (err) {
        return { source: "homemade_register", rows: [] as DiscoveredCompany[], error: err instanceof Error ? err.message : "collector failed" };
      }
    }),
  );

  const housingOk = !plan.mustNot.housingUnlessRequested;
  let droppedSkip = 0;
  let droppedHousing = 0;
  for (const block of settled) {
    let keptHere = 0;
    let droppedHere = 0;
    for (const row of block.rows) {
      if (!row?.name) {
        droppedHere += 1;
        continue;
      }
      if (alreadySeen(row, skip) || raw.some((h) => skipKeyOf(h.row).some((k) => skipKeyOf(row).includes(k)))) {
        droppedSkip += 1;
        droppedHere += 1;
        continue;
      }
      if (!housingOk && isHousingCompany(row)) {
        droppedHousing += 1;
        droppedHere += 1;
        continue;
      }
      raw.push({ row, sourceId: block.source });
      keptHere += 1;
    }
    report.push({
      source: block.source,
      ok: !block.error,
      hits: keptHere,
      dropped: droppedHere,
      error: block.error,
      note: collectorNote(block.source, country),
      parserVersion: REGISTER_PARSER_VERSION[block.source as keyof typeof REGISTER_PARSER_VERSION],
    });
  }

  const hydrateTargets = raw.slice(0, cap * 2);
  const hydrated = await poolMap(hydrateTargets, RUNTIME.hydrateConcurrency, async (hit) => {
    if (timedOut()) return { ...hit, row: hit.row, hydrated: false };
    const next = await hydrateOfficial(hit.row, country);
    return { ...hit, row: next, hydrated: next !== hit.row && Boolean(next.industryCode || next.businessId) };
  });

  const companies: HomemadeHit[] = [];
  let droppedFilter = 0;
  let droppedUnknown = 0;
  let hydratedKept = 0;
  const seenOut = new Set<string>();
  for (const hit of hydrated) {
    if (companies.length >= cap) break;
    if (alreadySeen(hit.row, skip)) {
      droppedSkip += 1;
      continue;
    }
    const key = (hit.row.businessId || normalizeName(hit.row.name)).toLowerCase();
    if (!key || seenOut.has(key)) continue;
    const gate = acceptDiscovered(hit.row, criteria);
    if (!gate.ok) {
      if (gate.missed.some((m) => m === "industry unknown")) droppedUnknown += 1;
      else droppedFilter += 1;
      continue;
    }
    seenOut.add(key);
    if (hit.row.businessId) skip.add(hit.row.businessId);
    skip.add(hit.row.name);
    if (hit.hydrated) hydratedKept += 1;
    companies.push({
      company: hit.row,
      sourceId: hit.sourceId,
      reasons: [hit.sourceId, ...gate.reasons],
    });
  }

  report.push({
    source: "homemade_register",
    ok: true,
    hits: companies.length,
    hydrated: hydratedKept,
    dropped: droppedFilter + droppedUnknown + droppedSkip + droppedHousing,
    note: needsOfficialIndustry(criteria)
      ? "Industry is required. Unhydrated directory rows without an official code are dropped."
      : "Homemade directories feed the same criteria gate as YTJ.",
  });
  if (droppedUnknown) {
    report.push({
      source: "homemade_register",
      ok: true,
      hits: 0,
      dropped: droppedUnknown,
      note: "Dropped: industry unknown after official hydrate",
    });
  }
  const diag = diagnoseRegisterEmpty(plan, report, { kept: companies.length, want: cap });
  if (diag && companies.length < cap) {
    report.push({
      source: "register_plan",
      ok: diag.code !== "SOURCE_UNAVAILABLE",
      hits: companies.length,
      code: diag.code,
      note: `${diag.code}: ${diag.text}`,
    });
  }
  return { companies, report, plan };
}
