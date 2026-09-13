import type { ContactHit, ObservationInput, PersonHit } from "../types.ts";
import { extractPeopleFromText, extractMeta, stripTags } from "../extract.ts";
import { isJunkEmail } from "../contacts.ts";
import { normalizeName, normalizeWebsite } from "../normalize.ts";
import { BROWSER_UA, safeFetch } from "../ssrf.ts";
import { reliability } from "./catalog.ts";
import { duckDuckGoHtmlSearch, isDirectoryHost } from "./webdiscover.ts";

export type LinkedInFacts = {
  companyUrl: string | null;
  people: PersonHit[];
  emails: ContactHit[];
  phones: ContactHit[];
  website: string | null;
  observations: ObservationInput[];
};

function linkedinKind(url: string): "company" | "person" | "other" {
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p.startsWith("/company/")) return "company";
    if (p.startsWith("/in/") || p.startsWith("/pub/")) return "person";
  } catch {
    /* ignore */
  }
  return "other";
}

async function fetchPublic(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 9000,
      maxBytes: 700_000,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (res.status >= 400) return null;
    return { html: res.body, finalUrl: res.url };
  } catch {
    return null;
  }
}

export async function linkedinLookup(opts: {
  name: string;
  municipality?: string | null;
  ceoHint?: string | null;
}): Promise<LinkedInFacts> {
  const rel = reliability("linkedin");
  const observations: ObservationInput[] = [];
  const people: PersonHit[] = [];
  const emails: ContactHit[] = [];
  const phones: ContactHit[] = [];
  let companyUrl: string | null = null;
  let website: string | null = null;

  const qCompany = `site:linkedin.com/company "${opts.name}"`;
  const qPeople = opts.ceoHint
    ? `site:linkedin.com/in "${opts.ceoHint}" ${opts.name}`
    : `"${opts.name}" (toimitusjohtaja OR CEO) site:linkedin.com`;
  const [companyHits, peopleHits] = await Promise.all([duckDuckGoHtmlSearch(qCompany), duckDuckGoHtmlSearch(qPeople)]);

  const companyHit = [...companyHits.hits, ...peopleHits.hits].find((h) => linkedinKind(h.url) === "company");
  if (companyHit) {
    companyUrl = companyHit.url.split("?")[0] ?? companyHit.url;
    const page = await fetchPublic(companyUrl);
    if (page) {
      const meta = extractMeta(page.html);
      const blob = `${meta.title ?? ""} ${stripTags(page.html).slice(0, 4000)}`;
      if (page.html.includes("authwall") || /sign in|join now|login/i.test(blob) && blob.length < 800) {
        observations.push({
          field: "linkedin",
          rawValue: companyUrl,
          normalisedValue: companyUrl,
          confidence: 50,
          sourceReliability: rel,
          extractionMethod: "linkedin_public",
          sourceUrl: companyUrl,
          verificationStatus: "unverified",
          evidence: "LinkedIn company URL found; public page is login-walled so contacts stay Not found",
        });
      } else {
        const ogUrl = meta["og:url"] || meta["og:see_also"];
        const site = normalizeWebsite(ogUrl && !isDirectoryHost(ogUrl) && !/linkedin\.com/i.test(ogUrl) ? ogUrl : null);
        if (site) website = site;
        people.push(
          ...extractPeopleFromText(blob, companyUrl, ["ceo", "chair", "cfo"]).map((p) => ({
            fullName: p.fullName,
            title: p.title,
            seniority: p.seniority,
            sourcePage: companyUrl,
            evidence: "LinkedIn public company page",
            confidence: Math.min(p.confidence, 62),
            profileUrl: companyUrl,
            workEmail: p.workEmail ?? null,
            workPhone: p.workPhone ?? null,
          })),
        );
        observations.push({
          field: "linkedin",
          rawValue: companyUrl,
          normalisedValue: companyUrl,
          confidence: 64,
          sourceReliability: rel,
          extractionMethod: "linkedin_public",
          sourceUrl: companyUrl,
          verificationStatus: "published",
          evidence: `LinkedIn company page “${meta.title ?? companyUrl}”`,
        });
      }
    }
  }

  for (const hit of peopleHits.hits) {
    if (linkedinKind(hit.url) !== "person") continue;
    const title = hit.title.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
    const parts = title.split(/\s[-–—]\s/);
    const fullName = parts[0]?.trim();
    const role = parts.slice(1).join(", ").trim();
    if (!fullName || fullName.split(" ").length < 2) continue;
    if (opts.name && !normalizeName(`${title} ${hit.snippet}`).includes(normalizeName(opts.name).split(" ")[0] ?? "")) {
      /* still keep if the snippet names the company */
    }
    people.push({
      fullName,
      title: role || "LinkedIn profile",
      seniority: /ceo|toimitusjohtaja|chairman|puheenjohtaja/i.test(role) ? "executive" : "unknown",
      sourcePage: hit.url,
      profileUrl: hit.url,
      evidence: `DuckDuckGo LinkedIn people result “${title}”`,
      confidence: 58,
    });
    if (people.length >= 4) break;
  }

  for (const e of [...companyHits.emails, ...peopleHits.emails]) {
    if (isJunkEmail(e.value)) continue;
    emails.push({ ...e, sourceId: "linkedin", evidence: e.evidence ?? "LinkedIn-adjacent public snippet" });
  }
  for (const p of [...companyHits.phones, ...peopleHits.phones]) {
    phones.push({ ...p, sourceId: "linkedin" });
  }

  if (!companyUrl) {
    observations.push({
      field: "linkedin",
      rawValue: "not_found",
      normalisedValue: "not_found",
      confidence: 40,
      sourceReliability: rel,
      extractionMethod: "duckduckgo_site_search",
      verificationStatus: "not_found",
      evidence: `No public LinkedIn company page indexed for ${opts.name}`,
    });
  }

  return { companyUrl, people, emails, phones, website, observations };
}
