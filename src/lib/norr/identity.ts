import { compareEntities, AUTO_MERGE_THRESHOLD, type DedupeDecision, type DedupeKey } from "./dedupe.ts";
import { normalizeBusinessId, normalizeDomain, normalizeName, toVatId } from "./normalize.ts";

export type IdentityStrength = "registry" | "vat" | "lei" | "domain" | "composite" | "name";

export type CompanyIdentity = {
  key: string;
  strength: IdentityStrength;
  businessId: string | null;
  vatId: string | null;
  lei: string | null;
  domain: string | null;
  nameNormalized: string | null;
  country: string | null;
};

/** ISO 17442 LEI: 20 alphanumeric characters. */
export function normalizeLei(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{20}$/.test(s)) return null;
  return s;
}

export function normalizeVatId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  const fi = s.match(/^FI(\d{8})$/);
  if (fi) return `FI${fi[1]}`;
  const bid = normalizeBusinessId(s);
  if (bid) return toVatId(bid);
  if (/^[A-Z]{2}[A-Z0-9]{8,12}$/.test(s)) return s;
  return null;
}

export function canonicalIdentity(input: DedupeKey & { vatId?: string | null }): CompanyIdentity {
  const businessId = normalizeBusinessId(input.businessId ?? null);
  const vatId = normalizeVatId(input.vatId ?? null) ?? (businessId ? toVatId(businessId) : null);
  const lei = normalizeLei(input.lei ?? null);
  const domain = normalizeDomain(input.domain ?? null);
  const nameNormalized = input.name ? normalizeName(input.name) : null;
  const country = input.country ? input.country.trim().toUpperCase() : null;

  if (businessId) {
    return { key: `bid:${businessId}`, strength: "registry", businessId, vatId, lei, domain, nameNormalized, country };
  }
  if (vatId) {
    return { key: `vat:${vatId}`, strength: "vat", businessId, vatId, lei, domain, nameNormalized, country };
  }
  if (lei) {
    return { key: `lei:${lei}`, strength: "lei", businessId, vatId, lei, domain, nameNormalized, country };
  }
  if (domain && nameNormalized) {
    return {
      key: `dom:${domain}|name:${nameNormalized}`,
      strength: "domain",
      businessId,
      vatId,
      lei,
      domain,
      nameNormalized,
      country,
    };
  }
  if (nameNormalized && country && input.postalCode) {
    return {
      key: `name:${nameNormalized}|${country}|${input.postalCode}`,
      strength: "composite",
      businessId,
      vatId,
      lei,
      domain,
      nameNormalized,
      country,
    };
  }
  return {
    key: `name:${nameNormalized ?? "unknown"}|${country ?? "xx"}`,
    strength: "name",
    businessId,
    vatId,
    lei,
    domain,
    nameNormalized,
    country,
  };
}

export function resolveIdentity(a: DedupeKey, b: DedupeKey): DedupeDecision {
  return compareEntities(a, b);
}

/** Auto-merge only with a hard identifier. Name-only similarity is never enough. */
export function shouldAutoMerge(a: DedupeKey, b: DedupeKey): boolean {
  const d = compareEntities(a, b);
  if (d.action !== "merge") return false;
  if (d.confidence < AUTO_MERGE_THRESHOLD) return false;
  const idA = canonicalIdentity(a);
  const idB = canonicalIdentity(b);
  if (idA.businessId && idB.businessId && idA.businessId !== idB.businessId) return false;
  if (idA.strength === "name" || idB.strength === "name") return false;
  return true;
}

export function sameCanonicalCompany(a: DedupeKey, b: DedupeKey): boolean {
  const ka = canonicalIdentity(a);
  const kb = canonicalIdentity(b);
  if (ka.businessId && kb.businessId) return ka.businessId === kb.businessId;
  if (ka.vatId && kb.vatId && ka.vatId === kb.vatId) return true;
  if (ka.lei && kb.lei && ka.lei === kb.lei) return true;
  return ka.key === kb.key && ka.strength !== "name";
}
