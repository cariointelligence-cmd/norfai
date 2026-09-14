/**
 * Isolated national environments. FI crawlers never run for SE/NO and vice versa.
 */
export type Nation = "FI" | "SE" | "NO";

export function nationOf(raw: string | null | undefined): Nation {
  const c = String(raw ?? "FI").toUpperCase();
  if (c === "SE") return "SE";
  if (c === "NO") return "NO";
  return "FI";
}

export type CountryEnv = {
  nation: Nation;
  official: string[];
  homemade: string[];
  allowFiDirectories: boolean;
  contactQueryWord: string;
  acceptLanguage: string;
  phoneRegion: "FI" | "SE" | "NO";
  sitePaths: string[];
};

const FI: CountryEnv = {
  nation: "FI",
  official: ["ytj"],
  homemade: ["finder", "kauppalehti", "northdata", "proff", "asiakastieto"],
  allowFiDirectories: true,
  contactQueryWord: "yhteystiedot",
  acceptLanguage: "fi-FI,fi;q=0.9,en;q=0.4",
  phoneRegion: "FI",
  sitePaths: [
    "/yhteystiedot", "/fi/yhteystiedot", "/tiimi", "/johto", "/hallitus",
    "/henkilosto", "/contact", "/en/contact",
  ],
};

const SE: CountryEnv = {
  nation: "SE",
  official: ["bolagsverket"],
  homemade: ["bolagsverket"],
  allowFiDirectories: false,
  contactQueryWord: "kontakt",
  acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.4",
  phoneRegion: "SE",
  sitePaths: [
    "/kontakt", "/sv/kontakt", "/kontakta-oss", "/om-oss", "/ledning",
    "/styrelsen", "/medarbetare",
  ],
};

const NO: CountryEnv = {
  nation: "NO",
  official: ["brreg"],
  homemade: ["brreg"],
  allowFiDirectories: false,
  contactQueryWord: "kontakt",
  acceptLanguage: "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.4",
  phoneRegion: "NO",
  sitePaths: [
    "/kontakt", "/kontakt-oss", "/om-oss", "/ledelsen", "/styret", "/ansatte", "/no/kontakt",
  ],
};

export function countryEnv(raw: string | null | undefined): CountryEnv {
  const n = nationOf(raw);
  if (n === "SE") return SE;
  if (n === "NO") return NO;
  return FI;
}

export function sourcesAllowedFor(nation: Nation, sourceId: string): boolean {
  const env = countryEnv(nation);
  return env.official.includes(sourceId) || env.homemade.includes(sourceId);
}
