import { normalizeBusinessId, normalizeDomain, normalizeName, toVatId } from "./normalize.ts";
import { placeNameSet } from "./finland.ts";

export type DedupeKey = {
  id: string;
  businessId?: string | null;
  vatId?: string | null;
  lei?: string | null;
  domain?: string | null;
  name?: string | null;
  country?: string | null;
  phone?: string | null;
  street?: string | null;
  postalCode?: string | null;
};

export type DedupeDecision =
  | { action: "merge"; confidence: number; reason: string }
  | { action: "review"; confidence: number; reason: string }
  | { action: "keep"; confidence: number; reason: string };

const GENERIC_CORE = new Set([
  "rakennus", "rakennusliike", "rakennuttaminen", "korjausrakentaminen",
  "palvelu", "palvelut", "group", "holding", "finland", "suomi", "suomen",
  "kiinteisto", "asunto", "consulting", "konsultointi", "engineering",
  "solutions", "systems", "system", "tech", "digital", "media", "yhtio",
  "yhtyma", "company", "corp", "services", "service", "nordic",
  "international", "partners", "partner", "studio", "agency", "toimisto",
  "liike", "kone", "kauppa", "maalaus", "maalausliike", "talotekniikka", "infra",
  "osakeyhtio", "aktiebolag", "suunnittelu", "urakointi", "asennus",
  "association", "yritys", "konserni",
]);

let placesCache: Set<string> | null = null;
function places(): Set<string> {
  if (!placesCache) placesCache = placeNameSet();
  return placesCache;
}

/** Legal-form-stripped name with trailing municipality/region tokens removed. */
export function coreCompanyName(name: string): string {
  let s = normalizeName(name);
  const loc = places();
  const tokens = s.split(" ").filter(Boolean);
  while (tokens.length >= 2) {
    const last = tokens[tokens.length - 1]!;
    const lastTwo = tokens.slice(-2).join(" ");
    if (loc.has(lastTwo)) {
      tokens.pop();
      tokens.pop();
      continue;
    }
    if (loc.has(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

export function isDistinctiveCoreName(core: string): boolean {
  const tokens = core.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const distinctive = tokens.filter((t) => t.length >= 4 && !GENERIC_CORE.has(t) && !places().has(t));
  return distinctive.length >= 1 && core.replace(/\s/g, "").length >= 4;
}

/** Drop trailing legal-form and municipality tokens, keep original casing. */
export function stripPlaceSuffixDisplay(name: string): string {
  const loc = places();
  const legal = new Set(["oy", "oyj", "ab", "abp", "ky", "ay", "tmi", "osk"]);
  const parts = name.trim().split(/\s+/);
  while (parts.length >= 2) {
    const last = parts[parts.length - 1]!.replace(/[.,]/g, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const lastTwo = parts
      .slice(-2)
      .map((p) => p.replace(/[.,]/g, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      .join(" ");
    if (legal.has(last)) {
      parts.pop();
      continue;
    }
    if (loc.has(lastTwo)) {
      parts.pop();
      parts.pop();
      continue;
    }
    if (loc.has(last)) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join(" ") || name;
}

export function compareEntities(a: DedupeKey, b: DedupeKey): DedupeDecision {
  const bidA = normalizeBusinessId(a.businessId ?? null);
  const bidB = normalizeBusinessId(b.businessId ?? null);
  if (bidA && bidB && bidA === bidB) {
    return { action: "merge", confidence: 99, reason: `Same Finnish Business ID ${bidA}` };
  }
  if (bidA && bidB && bidA !== bidB) {
    return { action: "keep", confidence: 0, reason: "Different Finnish Business IDs" };
  }
  const vatA = a.vatId?.toUpperCase() ?? (bidA ? toVatId(bidA) : null);
  const vatB = b.vatId?.toUpperCase() ?? (bidB ? toVatId(bidB) : null);
  if (vatA && vatB && vatA === vatB) {
    return { action: "merge", confidence: 97, reason: `Same VAT ID ${vatA}` };
  }
  if (a.lei && b.lei && a.lei === b.lei) {
    return { action: "merge", confidence: 98, reason: `Same LEI ${a.lei}` };
  }
  const dA = normalizeDomain(a.domain ?? null);
  const dB = normalizeDomain(b.domain ?? null);
  const nA = a.name ? normalizeName(a.name) : "";
  const nB = b.name ? normalizeName(b.name) : "";
  const coreA = a.name ? coreCompanyName(a.name) : "";
  const coreB = b.name ? coreCompanyName(b.name) : "";
  const sameBrand = Boolean(coreA && coreB && coreA === coreB && isDistinctiveCoreName(coreA));

  if (dA && dB && dA === dB && sameBrand) {
    return { action: "merge", confidence: 94, reason: `Same brand “${coreA}” on ${dA}` };
  }
  if (sameBrand && nA !== nB && (!bidA || !bidB)) {
    return { action: "merge", confidence: 91, reason: `Same company with a location branch (“${coreA}”)` };
  }
  if (dA && dB && dA === dB && nA && nA === nB) {
    return { action: "merge", confidence: 90, reason: `Same domain ${dA} and normalised name` };
  }
  if (dA && dB && dA === dB) {
    return { action: "review", confidence: 72, reason: `Same domain ${dA} but names differ` };
  }
  if (nA && nA === nB && a.country && a.country === b.country && a.postalCode && a.postalCode === b.postalCode) {
    return { action: "review", confidence: 68, reason: "Same normalised name, country and postal code" };
  }
  if (nA && nA === nB && a.country === b.country) {
    return { action: "review", confidence: 55, reason: "Same normalised name in the same country" };
  }
  return { action: "keep", confidence: 0, reason: "No shared strong identifier" };
}

export const AUTO_MERGE_THRESHOLD = 90;
