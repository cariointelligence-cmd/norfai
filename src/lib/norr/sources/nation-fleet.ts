/**
 * Free, in-process crawler fleet. No paid APIs.
 * FI/SE/NO catalogs never share country directories.
 */
import type { ContactHit, PersonHit } from "../types.ts";
import { extractEmails, extractPhones, isJunkEmail, isBillingEmail, isRecruitingEmail } from "../contacts.ts";
import { extractPeopleFromHtml, extractJsonLd } from "../extract.ts";
import { canonicalCompanyWebsite, normalizePhone } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { getJson } from "../http.ts";
import { nationOf, type Nation } from "../countries/env.ts";
import { poolMap } from "../engines.ts";
import { isJunkHost } from "../junk-hosts.ts";

export type FleetCtx = {
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  website?: string | null;
};

export type FleetCrawler = {
  id: string;
  nation: Nation;
  priority: number;
  parse: "html" | "json" | "wiki" | "nominatim" | "brreg-enhet" | "brreg-roller" | "gleif" | "wikidata" | "sitemap" | "humans";
  url: (ctx: FleetCtx) => string | null;
};

export type FleetHits = {
  emails: ContactHit[];
  phones: ContactHit[];
  people: PersonHit[];
  website: string | null;
  ran: string[];
};

const EMPTY: FleetHits = { emails: [], phones: [], people: [], website: null, ran: [] };

const enc = (s: string) => encodeURIComponent(s.trim());
const fiDigits = (bid?: string | null) => {
  const b = (bid ?? "").replace(/\s/g, "");
  return /^\d{7}-\d$/.test(b) ? b.replace(/\D/g, "") : "";
};

function q(ctx: FleetCtx): string {
  return [ctx.name, ctx.municipality].filter(Boolean).join(" ");
}

export const FI_FLEET: FleetCrawler[] = [
  { id: "fi_020202", nation: "FI", priority: 90, parse: "html", url: (c) => `https://www.020202.fi/haku?what=${enc(q(c))}` },
  { id: "fi_ytunnus", nation: "FI", priority: 92, parse: "html", url: (c) => (c.businessId && /^\d{7}-\d$/.test(c.businessId.replace(/\s/g, "")) ? `https://www.ytunnus.fi/${c.businessId.replace(/\s/g, "")}` : null) },
  { id: "fi_kauppalehti_id", nation: "FI", priority: 91, parse: "html", url: (c) => (fiDigits(c.businessId) ? `https://www.kauppalehti.fi/yritykset/yritys/${fiDigits(c.businessId)}` : null) },
  { id: "fi_kauppalehti_haku", nation: "FI", priority: 70, parse: "html", url: (c) => `https://www.kauppalehti.fi/yrityshaku?q=${enc(c.name)}` },
  { id: "fi_finder", nation: "FI", priority: 74, parse: "html", url: (c) => `https://www.finder.fi/search?what=${enc(q(c))}` },
  { id: "fi_fonecta", nation: "FI", priority: 72, parse: "html", url: (c) => `https://www.fonecta.fi/haku/${enc(c.name)}` },
  { id: "fi_asiakastieto", nation: "FI", priority: 68, parse: "html", url: (c) => `https://www.asiakastieto.fi/yritykset/fi/haku?searchText=${enc(c.name)}` },
  { id: "fi_proff", nation: "FI", priority: 67, parse: "html", url: (c) => `https://www.proff.fi/haku/${enc(c.name)}` },
  { id: "fi_wikipedia", nation: "FI", priority: 60, parse: "html", url: (c) => `https://fi.wikipedia.org/wiki/${enc(c.name.replace(/ /g, "_"))}` },
  { id: "fi_wikipedia_api", nation: "FI", priority: 61, parse: "wiki", url: (c) => `https://fi.wikipedia.org/api/rest_v1/page/summary/${enc(c.name)}` },
  { id: "fi_wikidata", nation: "FI", priority: 58, parse: "wikidata", url: (c) => `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(c.name)}&language=fi&format=json&limit=3` },
  { id: "fi_nominatim", nation: "FI", priority: 50, parse: "nominatim", url: (c) => `https://nominatim.openstreetmap.org/search?q=${enc(q(c))}&countrycodes=fi&format=json&limit=3` },
  { id: "fi_photon", nation: "FI", priority: 49, parse: "json", url: (c) => `https://photon.komoot.io/api/?q=${enc(q(c) + " Finland")}&limit=3` },
  { id: "fi_ddg", nation: "FI", priority: 55, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" yhteystiedot site:.fi`)}` },
  { id: "fi_ddg_mail", nation: "FI", priority: 56, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" email OR @ site:.fi`)}` },
  { id: "fi_startpage", nation: "FI", priority: 40, parse: "html", url: (c) => `https://www.startpage.com/sp/search?query=${enc(`${c.name} yhteystiedot`)}` },
  { id: "fi_opencorporates", nation: "FI", priority: 62, parse: "html", url: (c) => `https://opencorporates.com/companies?q=${enc(c.name)}&jurisdiction_code=fi` },
  { id: "fi_northdata", nation: "FI", priority: 57, parse: "html", url: (c) => `https://www.northdata.com/${enc(c.name)}` },
  { id: "fi_ytj_html", nation: "FI", priority: 80, parse: "html", url: (c) => (c.businessId ? `https://tietopalvelu.ytj.fi/yritystiedot.aspx?y-tunnus=${enc(c.businessId)}` : null) },
  { id: "fi_wayback", nation: "FI", priority: 30, parse: "json", url: (c) => (c.website ? `https://web.archive.org/cdx/search/cdx?url=${enc(c.website)}&output=json&limit=1` : null) },
  { id: "fi_gleif", nation: "FI", priority: 52, parse: "gleif", url: (c) => `https://api.gleif.org/api/v1/lei-records?page[size]=3&filter[entity.legalName]=${enc(c.name)}` },
  { id: "fi_sitemap", nation: "FI", priority: 64, parse: "sitemap", url: (c) => (origin(c.website) ? `${origin(c.website)}/sitemap.xml` : null) },
  { id: "fi_humans", nation: "FI", priority: 45, parse: "humans", url: (c) => (origin(c.website) ? `${origin(c.website)}/humans.txt` : null) },
  { id: "fi_contact_page", nation: "FI", priority: 85, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/yhteystiedot` : null) },
  { id: "fi_team_page", nation: "FI", priority: 84, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/tiimi` : null) },
  { id: "fi_johto_page", nation: "FI", priority: 86, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/johto` : null) },
  { id: "fi_europages", nation: "FI", priority: 35, parse: "html", url: (c) => `https://www.europages.co.uk/companies/${enc(c.name)}.html` },
  { id: "fi_kompass", nation: "FI", priority: 34, parse: "html", url: (c) => `https://fi.kompass.com/searchCompanies?acClassif=&distributionType=&searchType=CO&text=${enc(c.name)}` },
];

export const SE_FLEET: FleetCrawler[] = [
  { id: "se_allabolag_search", nation: "SE", priority: 90, parse: "html", url: (c) => `https://www.allabolag.se/what/${enc(q(c))}` },
  { id: "se_allabolag_card", nation: "SE", priority: 92, parse: "html", url: (c) => (seOrg(c.businessId) ? `https://www.allabolag.se/${seOrg(c.businessId)}` : null) },
  { id: "se_allabolag_styrelse", nation: "SE", priority: 88, parse: "html", url: (c) => (seOrg(c.businessId) ? `https://www.allabolag.se/${seOrg(c.businessId)}/befattningshavare` : null) },
  { id: "se_hitta", nation: "SE", priority: 74, parse: "html", url: (c) => `https://www.hitta.se/s%C3%B6k?vad=${enc(q(c))}` },
  { id: "se_eniro", nation: "SE", priority: 72, parse: "html", url: (c) => `https://www.eniro.se/query?search_word=${enc(c.name)}` },
  { id: "se_proff", nation: "SE", priority: 73, parse: "html", url: (c) => `https://www.proff.se/bransch-s%C3%B6k?q=${enc(c.name)}` },
  { id: "se_ratsit", nation: "SE", priority: 60, parse: "html", url: (c) => `https://www.ratsit.se/sok/foretag?vem=${enc(c.name)}` },
  { id: "se_merinfo", nation: "SE", priority: 58, parse: "html", url: (c) => `https://www.merinfo.se/search?q=${enc(c.name)}` },
  { id: "se_wikipedia", nation: "SE", priority: 61, parse: "html", url: (c) => `https://sv.wikipedia.org/wiki/${enc(c.name.replace(/ /g, "_"))}` },
  { id: "se_wikipedia_api", nation: "SE", priority: 62, parse: "wiki", url: (c) => `https://sv.wikipedia.org/api/rest_v1/page/summary/${enc(c.name)}` },
  { id: "se_wikidata", nation: "SE", priority: 57, parse: "wikidata", url: (c) => `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(c.name)}&language=sv&format=json&limit=3` },
  { id: "se_nominatim", nation: "SE", priority: 50, parse: "nominatim", url: (c) => `https://nominatim.openstreetmap.org/search?q=${enc(q(c))}&countrycodes=se&format=json&limit=3` },
  { id: "se_photon", nation: "SE", priority: 49, parse: "json", url: (c) => `https://photon.komoot.io/api/?q=${enc(q(c) + " Sweden")}&limit=3` },
  { id: "se_ddg", nation: "SE", priority: 55, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" kontakt site:.se`)}` },
  { id: "se_ddg_mail", nation: "SE", priority: 56, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" e-post OR @ site:.se`)}` },
  { id: "se_startpage", nation: "SE", priority: 40, parse: "html", url: (c) => `https://www.startpage.com/sp/search?query=${enc(`${c.name} kontakt`)}` },
  { id: "se_opencorporates", nation: "SE", priority: 66, parse: "html", url: (c) => `https://opencorporates.com/companies?q=${enc(c.name)}&jurisdiction_code=se` },
  { id: "se_bolagsfakta", nation: "SE", priority: 64, parse: "html", url: (c) => `https://www.bolagsfakta.se/search?q=${enc(c.name)}` },
  { id: "se_infoo", nation: "SE", priority: 54, parse: "html", url: (c) => `https://www.infoo.se/foretag?q=${enc(c.name)}` },
  { id: "se_118100", nation: "SE", priority: 52, parse: "html", url: (c) => `https://www.118100.se/search/?q=${enc(c.name)}` },
  { id: "se_gleif", nation: "SE", priority: 51, parse: "gleif", url: (c) => `https://api.gleif.org/api/v1/lei-records?page[size]=3&filter[entity.legalName]=${enc(c.name)}` },
  { id: "se_sitemap", nation: "SE", priority: 65, parse: "sitemap", url: (c) => (origin(c.website) ? `${origin(c.website)}/sitemap.xml` : null) },
  { id: "se_humans", nation: "SE", priority: 45, parse: "humans", url: (c) => (origin(c.website) ? `${origin(c.website)}/humans.txt` : null) },
  { id: "se_kontakt", nation: "SE", priority: 85, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/kontakt` : null) },
  { id: "se_ledning", nation: "SE", priority: 86, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/ledning` : null) },
  { id: "se_omoss", nation: "SE", priority: 80, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/om-oss` : null) },
  { id: "se_europages", nation: "SE", priority: 35, parse: "html", url: (c) => `https://www.europages.co.uk/companies/${enc(c.name)}.html` },
  { id: "se_largestcompanies", nation: "SE", priority: 48, parse: "html", url: (c) => `https://www.largestcompanies.com/search?q=${enc(c.name)}` },
];

export const NO_FLEET: FleetCrawler[] = [
  { id: "no_brreg_search", nation: "NO", priority: 95, parse: "brreg-enhet", url: (c) => `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${enc(c.name)}&size=5` },
  { id: "no_brreg_id", nation: "NO", priority: 96, parse: "brreg-enhet", url: (c) => (noOrg(c.businessId) ? `https://data.brreg.no/enhetsregisteret/api/enheter/${noOrg(c.businessId)}` : null) },
  { id: "no_brreg_roller", nation: "NO", priority: 94, parse: "brreg-roller", url: (c) => (noOrg(c.businessId) ? `https://data.brreg.no/enhetsregisteret/api/enheter/${noOrg(c.businessId)}/roller` : null) },
  { id: "no_brreg_under", nation: "NO", priority: 70, parse: "json", url: (c) => (noOrg(c.businessId) ? `https://data.brreg.no/enhetsregisteret/api/underenheter?overordnetEnhet=${noOrg(c.businessId)}&size=5` : null) },
  { id: "no_proff", nation: "NO", priority: 74, parse: "html", url: (c) => `https://www.proff.no/bransjes%C3%B8k?q=${enc(c.name)}` },
  { id: "no_gulesider", nation: "NO", priority: 72, parse: "html", url: (c) => `https://www.gulesider.no/finn:${enc(c.name)}` },
  { id: "no_1881", nation: "NO", priority: 71, parse: "html", url: (c) => `https://www.1881.no/?query=${enc(c.name)}` },
  { id: "no_purehelp", nation: "NO", priority: 63, parse: "html", url: (c) => `https://www.purehelp.no/search?q=${enc(c.name)}` },
  { id: "no_forvalt", nation: "NO", priority: 60, parse: "html", url: (c) => `https://forvalt.no/index.php?search=${enc(c.name)}` },
  { id: "no_wikipedia", nation: "NO", priority: 61, parse: "html", url: (c) => `https://no.wikipedia.org/wiki/${enc(c.name.replace(/ /g, "_"))}` },
  { id: "no_wikipedia_api", nation: "NO", priority: 62, parse: "wiki", url: (c) => `https://no.wikipedia.org/api/rest_v1/page/summary/${enc(c.name)}` },
  { id: "no_wikidata", nation: "NO", priority: 57, parse: "wikidata", url: (c) => `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(c.name)}&language=nb&format=json&limit=3` },
  { id: "no_nominatim", nation: "NO", priority: 50, parse: "nominatim", url: (c) => `https://nominatim.openstreetmap.org/search?q=${enc(q(c))}&countrycodes=no&format=json&limit=3` },
  { id: "no_photon", nation: "NO", priority: 49, parse: "json", url: (c) => `https://photon.komoot.io/api/?q=${enc(q(c) + " Norway")}&limit=3` },
  { id: "no_ddg", nation: "NO", priority: 55, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" kontakt site:.no`)}` },
  { id: "no_ddg_mail", nation: "NO", priority: 56, parse: "html", url: (c) => `https://html.duckduckgo.com/html/?q=${enc(`"${c.name}" e-post OR @ site:.no`)}` },
  { id: "no_startpage", nation: "NO", priority: 40, parse: "html", url: (c) => `https://www.startpage.com/sp/search?query=${enc(`${c.name} kontakt`)}` },
  { id: "no_opencorporates", nation: "NO", priority: 66, parse: "html", url: (c) => `https://opencorporates.com/companies?q=${enc(c.name)}&jurisdiction_code=no` },
  { id: "no_gleif", nation: "NO", priority: 51, parse: "gleif", url: (c) => `https://api.gleif.org/api/v1/lei-records?page[size]=3&filter[entity.legalName]=${enc(c.name)}` },
  { id: "no_sitemap", nation: "NO", priority: 65, parse: "sitemap", url: (c) => (origin(c.website) ? `${origin(c.website)}/sitemap.xml` : null) },
  { id: "no_humans", nation: "NO", priority: 45, parse: "humans", url: (c) => (origin(c.website) ? `${origin(c.website)}/humans.txt` : null) },
  { id: "no_kontakt", nation: "NO", priority: 85, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/kontakt` : null) },
  { id: "no_ledelse", nation: "NO", priority: 86, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/ledelsen` : null) },
  { id: "no_omoss", nation: "NO", priority: 80, parse: "html", url: (c) => (origin(c.website) ? `${origin(c.website)}/om-oss` : null) },
  { id: "no_brreg_html", nation: "NO", priority: 78, parse: "html", url: (c) => `https://virksomhet.brreg.no/nb/oppslag/enheter?q=${enc(c.name)}` },
  { id: "no_europages", nation: "NO", priority: 35, parse: "html", url: (c) => `https://www.europages.co.uk/companies/${enc(c.name)}.html` },
  { id: "no_proff_regnskap", nation: "NO", priority: 58, parse: "html", url: (c) => `https://www.proff.no/bransjes%C3%B8k?q=${enc(c.name)}` },
];

function seOrg(bid?: string | null): string {
  const d = String(bid ?? "").replace(/\D/g, "");
  return d.length === 10 ? d : "";
}
function noOrg(bid?: string | null): string {
  const d = String(bid ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(0, 9) : "";
}
function origin(website?: string | null): string | null {
  const w = canonicalCompanyWebsite(website ?? null);
  if (!w) return null;
  try { return new URL(w).origin; } catch { return null; }
}

export function fleetFor(nation: Nation): FleetCrawler[] {
  if (nation === "SE") return SE_FLEET;
  if (nation === "NO") return NO_FLEET;
  return FI_FLEET;
}

export function pickFleet(nation: Nation, ctx: FleetCtx, limit = 10, skip: string[] = []): FleetCrawler[] {
  const deny = new Set(skip);
  return fleetFor(nation)
    .filter((c) => c.nation === nation && !deny.has(c.id) && Boolean(c.url(ctx)))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(4, Math.min(limit, 12)));
}

function hostOk(url: string, nation: Nation): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (nation === "FI" && (host.endsWith(".se") || host.endsWith(".no")) && !host.includes("wikipedia") && !host.includes("wikidata") && !host.includes("gleif") && !host.includes("opencorporates") && !host.includes("northdata") && !host.includes("europages") && !host.includes("komoot") && !host.includes("openstreetmap") && !host.includes("duckduckgo") && !host.includes("startpage") && !host.includes("archive.org")) return false;
    if (nation === "SE" && host.endsWith(".fi") && !host.includes("wikipedia")) return false;
    if (nation === "NO" && host.endsWith(".fi") && !host.includes("wikipedia")) return false;
    return true;
  } catch { return false; }
}

async function pull(url: string, json: boolean): Promise<{ text: string; json: unknown } | null> {
  try {
    if (json) {
      const r = await getJson<unknown>(url, { timeoutMs: 1600, headers: { Accept: "application/json", "User-Agent": BROWSER_UA } });
      if (!r.ok) return null;
      return { text: "", json: r.data };
    }
    const res = await safeFetch(url, {
      timeoutMs: 1400,
      maxBytes: 140_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/json;q=0.8", "Accept-Language": "en,fi,sv,nb;q=0.8" },
    });
    if (res.status >= 400 || res.body.length < 20) return null;
    return { text: res.body, json: null };
  } catch { return null; }
}

function pushEmail(into: ContactHit[], raw: string | null | undefined, url: string, id: string): void {
  const v = (raw ?? "").replace(/^mailto:/i, "").trim().toLowerCase();
  if (!v.includes("@") || isJunkEmail(v) || isBillingEmail(v) || isRecruitingEmail(v)) return;
  if (into.some((e) => e.value === v)) return;
  into.push({ kind: "email", value: v, classification: "published", sourceId: id, sourceUrl: url, evidence: `Fleet ${id}`, confidence: 70 });
}
function pushPhone(into: ContactHit[], raw: string | null | undefined, url: string, id: string, nation: Nation): void {
  const v = normalizePhone(raw ?? "", nation) ?? "";
  if (!v || into.some((p) => p.value === v)) return;
  if (nation === "FI" && !v.startsWith("+358")) return;
  if (nation === "SE" && !v.startsWith("+46")) return;
  if (nation === "NO" && !v.startsWith("+47")) return;
  into.push({ kind: "phone", value: v, classification: "published", sourceId: id, sourceUrl: url, evidence: `Fleet ${id}`, confidence: 68 });
}

function ingestHtml(html: string, url: string, id: string, nation: Nation, hits: FleetHits): void {
  const slice = html.slice(0, 70_000);
  for (const e of extractEmails(slice)) pushEmail(hits.emails, e.value, url, id);
  for (const p of extractPhones(slice.replace(/<[^>]+>/g, " ").slice(0, 12_000), nation)) pushPhone(hits.phones, p, url, id, nation);
  try {
    const ld = extractJsonLd(slice);
    for (const org of ld.orgs) {
      pushEmail(hits.emails, org.email, url, id);
      pushPhone(hits.phones, org.telephone, url, id, nation);
      const site = canonicalCompanyWebsite(org.url ?? null);
      if (site && !hits.website && !isJunkHost(new URL(site).hostname)) hits.website = site;
    }
    for (const person of ld.persons) {
      if (person.name) hits.people.push({ fullName: person.name, title: person.jobTitle ?? null, workEmail: person.email ?? null, confidence: 74, sourcePage: url });
    }
  } catch { /* optional */ }
  hits.people.push(...extractPeopleFromHtml(slice.slice(0, 12_000), url).slice(0, 6));
  if (!hits.website) {
    const m = slice.match(/https?:\/\/(?!www\.(?:finder|fonecta|kauppalehti|allabolag|hitta|proff|gulesider|1881|wikipedia|wikidata))[a-z0-9.-]+\.(fi|se|no)\b/i);
    const site = canonicalCompanyWebsite(m?.[0] ?? null);
    if (site) hits.website = site;
  }
}

function ingestParsed(crawler: FleetCrawler, body: { text: string; json: unknown }, url: string, hits: FleetHits): void {
  const nation = crawler.nation;
  const id = crawler.id;
  if (crawler.parse === "html" || crawler.parse === "humans") {
    ingestHtml(body.text, url, id, nation, hits);
    return;
  }
  if (crawler.parse === "wiki") {
    const rec = body.json as { extract?: string; content_urls?: { desktop?: { page?: string } } } | null;
    if (rec?.extract) ingestHtml(rec.extract, url, id, nation, hits);
    return;
  }
  if (crawler.parse === "brreg-enhet") {
    const raw = (body.json ?? {}) as Record<string, unknown>;
    const embedded = raw._embedded as { enheter?: Array<Record<string, unknown>> } | undefined;
    const rows = embedded?.enheter ?? (raw.navn ? [raw] : []);
    for (const row of rows.slice(0, 3)) {
      const site = canonicalCompanyWebsite(typeof row.hjemmeside === "string" ? row.hjemmeside : null);
      if (site && !hits.website) hits.website = site;
    }
    return;
  }
  if (crawler.parse === "brreg-roller") {
    const groups = (body.json as { rollegrupper?: any[] } | null)?.rollegrupper ?? [];
    for (const g of groups) {
      for (const r of g.roller ?? []) {
        const n = [r.person?.navn?.fornavn, r.person?.navn?.etternavn].filter(Boolean).join(" ");
        if (!n) continue;
        hits.people.push({
          fullName: n,
          title: r.type?.beskrivelse ?? g.type?.beskrivelse ?? null,
          seniority: /DAGL|LEDE|CEO/i.test(String(g.type?.kode ?? "")) ? "executive" : null,
          confidence: 88,
          sourcePage: url,
        });
      }
    }
    return;
  }
  if (crawler.parse === "gleif") {
    const rec = body.json as { data?: Array<{ attributes?: { entity?: { legalName?: { name?: string }; registeredAs?: string } } }> };
    void rec;
    return;
  }
  if (crawler.parse === "sitemap" && body.text) {
    const locs = [...body.text.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1] ?? "");
    const want = locs.filter((u) => /kontakt|contact|yhteystiedot|team|tiimi|ledning|ledelse|about|om-oss/i.test(u)).slice(0, 3);
    void want;
  }
}

export async function runNationFleet(opts: {
  country?: string | null;
  name: string;
  businessId?: string | null;
  municipality?: string | null;
  website?: string | null;
  limit?: number;
  skip?: string[];
}): Promise<FleetHits> {
  const nation = nationOf(opts.country);
  const ctx: FleetCtx = { name: opts.name, businessId: opts.businessId, municipality: opts.municipality, website: opts.website };
  const crawlers = pickFleet(nation, ctx, opts.limit ?? 8, opts.skip ?? []);
  const hits: FleetHits = { emails: [], phones: [], people: [], website: null, ran: [] };
  const pages = await poolMap(crawlers, 5, async (c) => {
    const url = c.url(ctx);
    if (!url || !hostOk(url, nation)) return null;
    const json = c.parse !== "html" && c.parse !== "humans" && c.parse !== "sitemap";
    const body = await pull(url, json);
    if (!body) return null;
    return { c, url, body };
  });
  for (const row of pages) {
    if (!row) continue;
    hits.ran.push(row.c.id);
    ingestParsed(row.c, row.body, row.url, hits);
    if (hits.emails.length >= 2 && hits.phones.length >= 1 && hits.people.length >= 1) break;
  }
  const people: PersonHit[] = [];
  const seen = new Set<string>();
  for (const p of hits.people) {
    const k = (p.fullName ?? "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    people.push(p);
    if (people.length >= 12) break;
  }
  hits.people = people;
  return hits;
}

export function fleetCounts(): { FI: number; SE: number; NO: number } {
  return { FI: FI_FLEET.length, SE: SE_FLEET.length, NO: NO_FLEET.length };
}
