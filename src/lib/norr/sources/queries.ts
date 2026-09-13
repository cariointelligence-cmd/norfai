export const SUPPORTED_COUNTRIES = ["FI", "NO", "DK", "SE", "GB", "DE", "US", "EU"] as const;
export type SearchCountry = (typeof SUPPORTED_COUNTRIES)[number];

export function isSupportedCountry(value: string): value is SearchCountry {
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(value);
}

type CountryMeta = {
  tlds: string[];
  siteHint: string;
  contactTerms: string;
  directoryExclude: string;
};

export const COUNTRY_META: Record<string, CountryMeta> = {
  FI: {
    tlds: [".fi", ".com", ".net"],
    siteHint: "site:.fi",
    contactTerms: "yhteystiedot OR kotisivut OR contact",
    directoryExclude: "-site:finder.fi -site:ytj.fi -site:asiakastieto.fi",
  },
  SE: {
    tlds: [".se", ".com"],
    siteHint: "site:.se",
    contactTerms: "kontakt OR hemsida OR contact",
    directoryExclude: "-site:hitta.se -site:allabolag.se -site:proff.se",
  },
  NO: {
    tlds: [".no", ".com"],
    siteHint: "site:.no",
    contactTerms: "kontakt OR contact",
    directoryExclude: "-site:proff.no -site:gulesider.no",
  },
  DK: {
    tlds: [".dk", ".com"],
    siteHint: "site:.dk",
    contactTerms: "kontakt OR contact",
    directoryExclude: "-site:krak.dk -site:cvr.dk",
  },
  GB: {
    tlds: [".co.uk", ".uk", ".com"],
    siteHint: "site:.co.uk OR site:.uk",
    contactTerms: "contact OR \"about us\" OR \"registered office\"",
    directoryExclude: "-site:endole.co.uk -site:companycheck.co.uk",
  },
  DE: {
    tlds: [".de", ".com"],
    siteHint: "site:.de",
    contactTerms: "impressum OR kontakt OR contact",
    directoryExclude: "-site:northdata.de -site:unternehmensregister.de",
  },
  US: {
    tlds: [".com", ".net", ".io"],
    siteHint: "",
    contactTerms: "contact OR \"about us\" OR leadership",
    directoryExclude: "-site:bloomberg.com -site:crunchbase.com -site:zoominfo.com",
  },
  EU: {
    tlds: [".eu", ".com", ".fi", ".de", ".se"],
    siteHint: "",
    contactTerms: "contact OR impressum OR yhteystiedot OR kontakt",
    directoryExclude: "-site:opencorporates.com",
  },
};

export function countryTlds(country?: string | null): string[] {
  return COUNTRY_META[country ?? "FI"]?.tlds ?? [".fi", ".com", ".net"];
}

export function expandSearchQueries(opts: {
  name: string;
  country?: string | null;
  municipality?: string | null;
  businessId?: string | null;
  depth?: "normal" | "deep";
}): string[] {
  const name = opts.name.trim();
  if (!name) return [];
  const meta = COUNTRY_META[opts.country ?? "FI"] ?? COUNTRY_META.FI!;
  const loc = opts.municipality?.trim() ?? "";
  const bid = opts.businessId?.trim() ?? "";
  const quoted = `"${name}"`;
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.replace(/\s+/g, " ").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(quoted);
  if (loc) push(`${quoted} ${loc}`);
  push(`${quoted} ${meta.contactTerms}`);
  if ((opts.country ?? "FI") === "FI") push(`${quoted} Y-tunnus`);
  if (bid) push(`${quoted} ${bid}`);
  push(`${quoted} (CEO OR toimitusjohtaja OR Geschäftsführer OR "managing director")`);
  push(`${quoted} LinkedIn`);
  if (meta.siteHint) push(`${quoted} ${meta.siteHint} ${meta.directoryExclude}`);
  push(`${quoted} (address OR osoite OR Anschrift OR "registered office")`);
  push(`${quoted} (yhteystiedot OR contact OR kotisivu OR "official website")`);
  push(`${quoted} (employees OR henkilöstö OR Mitarbeiter)`);
  push(`${quoted} (team OR johto OR Impressum OR ura OR careers)`);
  if (opts.depth === "deep") {
    push(`${quoted} (press OR tiedote OR "press release")`);
    push(`${quoted} (procurement OR hankinta OR tender)`);
    if (loc) push(`${quoted} ${loc} ${meta.contactTerms}`);
  }
  return out.slice(0, 12);
}
