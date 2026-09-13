import type { AdapterResult, ContactHit, DiscoveredCompany } from "../types.ts";
import { getJson } from "../http.ts";
import { FETCH_UA } from "../ssrf.ts";
import { reliability } from "./catalog.ts";
import {
  bolagsverketSearch,
  businessFinlandFunding,
  commonCrawlLookup,
  companiesHousePublic,
  ejusticePortal,
  mailboxFromDomain,
  openCorporatesPublic,
  publicWebSearch,
  publishedAccountsLookup,
  statfinPing,
} from "./homemade.ts";

export {
  bolagsverketSearch,
  businessFinlandFunding,
  commonCrawlLookup,
  ejusticePortal,
  publishedAccountsLookup,
  statfinPing,
};

function hasKey(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

export async function openCorporatesSearch(query: string, jurisdiction = "fi"): Promise<AdapterResult<DiscoveredCompany[]>> {
  const key = hasKey("OPENCORPORATES_API_KEY");
  if (key) {
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(query)}&jurisdiction_code=${encodeURIComponent(jurisdiction)}&per_page=8`;
    const r = await getJson<{
      results?: {
        companies?: Array<{
          company?: {
            name?: string;
            company_number?: string;
            jurisdiction_code?: string;
            current_status?: string;
            registered_address_in_full?: string;
            opencorporates_url?: string;
          };
        }>;
      };
    }>(url, { headers: { Accept: "application/json", "User-Agent": FETCH_UA, "X-API-Token": key } });
    if (r.ok) {
      const rows = r.data.results?.companies ?? [];
      const data: DiscoveredCompany[] = rows
        .map((row) => row.company)
        .filter((c): c is NonNullable<typeof c> => Boolean(c?.name))
        .map((c) => ({
          businessId: c.company_number ?? null,
          name: c.name!,
          country: (c.jurisdiction_code ?? jurisdiction).slice(0, 2).toUpperCase(),
          businessStatus: c.current_status ?? null,
          street: c.registered_address_in_full ?? null,
        }));
      if (data.length) {
        return {
          ok: true,
          data,
          observations: data.slice(0, 1).map((c) => ({
            field: "name",
            rawValue: c.name,
            normalisedValue: c.name,
            confidence: 70,
            sourceReliability: reliability("opencorporates"),
            extractionMethod: "opencorporates_json",
            sourceUrl: "https://opencorporates.com/",
            licence: "OpenCorporates licence",
            verificationStatus: "published",
          })),
          sourceUrl: url.split("&api")[0],
        };
      }
    }
  }
  return openCorporatesPublic(query, jurisdiction);
}

export async function hunterDomainSearch(domain: string): Promise<AdapterResult<ContactHit[]>> {
  const key = hasKey("HUNTER_API_KEY");
  if (key) {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10`;
    const r = await getJson<{
      data?: {
        emails?: Array<{ value?: string; type?: string; first_name?: string; last_name?: string; position?: string; confidence?: number }>;
      };
    }>(url, { headers: { "X-API-Key": key } });
    if (r.ok) {
      const hits: ContactHit[] = (r.data.data?.emails ?? [])
        .filter((e) => e.value)
        .map((e) => ({
          kind: "email" as const,
          value: String(e.value).toLowerCase(),
          classification: "inferred" as const,
          roleAddress: e.type === "generic",
          evidence: [e.first_name, e.last_name, e.position].filter(Boolean).join(" "),
          sourceUrl: `https://hunter.io/search/${domain}`,
          confidence: Math.min(85, Number(e.confidence ?? 50)),
          derivationMethod: "hunter_domain_search",
        }));
      if (hits.length) return { ok: true, data: hits, observations: [], sourceUrl: `https://hunter.io/search/${domain}` };
    }
  }
  return mailboxFromDomain(domain);
}

export async function companiesHouseSearch(query: string): Promise<AdapterResult<DiscoveredCompany[]>> {
  const key = hasKey("COMPANIES_HOUSE_API_KEY");
  if (key) {
    const auth = Buffer.from(`${key}:`).toString("base64");
    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=8`;
    const r = await getJson<{
      items?: Array<{
        title?: string;
        company_number?: string;
        company_status?: string;
        company_type?: string;
        address_snippet?: string;
        date_of_creation?: string;
      }>;
    }>(url, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } });
    if (r.ok) {
      const data: DiscoveredCompany[] = (r.data.items ?? []).map((c) => ({
        businessId: c.company_number ?? null,
        name: c.title ?? "Unknown",
        country: "GB",
        businessStatus: c.company_status ?? null,
        legalForm: c.company_type ?? null,
        street: c.address_snippet ?? null,
        registrationDate: c.date_of_creation ?? null,
      }));
      if (data.length) return { ok: true, data, observations: [], sourceUrl: url };
    }
  }
  return companiesHousePublic(query);
}

export async function configuredSearch(query: string): Promise<AdapterResult<{ title: string; url: string }[]>> {
  const key = hasKey("SEARCH_API_KEY");
  if (key) {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=5`;
    const r = await getJson<{ webPages?: { value?: Array<{ name?: string; url?: string }> } }>(url, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (r.ok) {
      const data = (r.data.webPages?.value ?? [])
        .filter((v) => v.url && v.name)
        .map((v) => ({ title: String(v.name), url: String(v.url) }));
      if (data.length) return { ok: true, data, observations: [], sourceUrl: "https://www.bing.com/" };
    }
  }
  return publicWebSearch(query);
}
