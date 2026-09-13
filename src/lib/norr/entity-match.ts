import { coreCompanyName, isDistinctiveCoreName } from "./dedupe.ts";
import { normalizeBusinessId, normalizeDomain, normalizeName } from "./normalize.ts";
import { normalizeLei, normalizeVatId } from "./identity.ts";

export type EntityMatchMethod =
  | "business_id"
  | "vat"
  | "lei"
  | "domain"
  | "exact_name"
  | "distinctive_core"
  | "address"
  | "name_only"
  | "none";

export type EntityMatch = {
  companyId?: string | null;
  sourceEntity: string;
  identifiersMatched: string[];
  nameSimilarity: number;
  addressMatch: boolean;
  domainMatch: boolean;
  confidence: number;
  method: EntityMatchMethod;
  status: "MATCH" | "AMBIGUOUS" | "NO_MATCH";
  reason: string;
};

const HIGH_IMPACT_MIN = 88;

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  const ca = coreCompanyName(a);
  const cb = coreCompanyName(b);
  if (ca && cb && ca === cb && isDistinctiveCoreName(ca)) return 90;
  if (ca && cb && ca.length >= 8 && (ca.includes(cb) || cb.includes(ca))) {
    const ratio = Math.min(ca.length, cb.length) / Math.max(ca.length, cb.length);
    return Math.round(55 + ratio * 25);
  }
  const tokensA = new Set(na.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (!tokensA.size || !tokensB.size) return 10;
  let hit = 0;
  for (const t of tokensA) if (tokensB.has(t)) hit += 1;
  return Math.round((hit / Math.max(tokensA.size, tokensB.size)) * 70);
}

export function resolveEntityMatch(opts: {
  company: {
    name: string;
    businessId?: string | null;
    vatId?: string | null;
    lei?: string | null;
    domain?: string | null;
    municipality?: string | null;
    address?: string | null;
  };
  source: {
    name?: string | null;
    businessId?: string | null;
    vatId?: string | null;
    lei?: string | null;
    domain?: string | null;
    municipality?: string | null;
    address?: string | null;
  };
  alternatives?: number;
}): EntityMatch {
  const identifiers: string[] = [];
  const bidA = normalizeBusinessId(opts.company.businessId ?? null);
  const bidB = normalizeBusinessId(opts.source.businessId ?? null);
  if (bidA && bidB && bidA === bidB) identifiers.push("business_id");
  const vatA = normalizeVatId(opts.company.vatId ?? null);
  const vatB = normalizeVatId(opts.source.vatId ?? null);
  if (vatA && vatB && vatA === vatB) identifiers.push("vat");
  const leiA = normalizeLei(opts.company.lei ?? null);
  const leiB = normalizeLei(opts.source.lei ?? null);
  if (leiA && leiB && leiA === leiB) identifiers.push("lei");
  const domA = normalizeDomain(opts.company.domain ?? null);
  const domB = normalizeDomain(opts.source.domain ?? null);
  const domainMatch = Boolean(domA && domB && domA === domB);
  if (domainMatch) identifiers.push("domain");
  const addressMatch = Boolean(
    opts.company.municipality &&
      opts.source.municipality &&
      opts.company.municipality.toLowerCase() === opts.source.municipality.toLowerCase(),
  );
  const sim = nameSimilarity(opts.company.name, opts.source.name ?? "");
  let method: EntityMatchMethod = "none";
  let confidence = sim;
  if (identifiers.includes("business_id")) {
    method = "business_id";
    confidence = 99;
  } else if (identifiers.includes("vat")) {
    method = "vat";
    confidence = 97;
  } else if (identifiers.includes("lei")) {
    method = "lei";
    confidence = 96;
  } else if (domainMatch && sim >= 50) {
    method = "domain";
    confidence = 90;
  } else if (sim >= 100) {
    method = "exact_name";
    confidence = addressMatch ? 96 : 92;
  } else if (sim >= 90) {
    method = "distinctive_core";
    confidence = addressMatch ? 90 : 86;
  } else if (sim >= 70 && addressMatch) {
    method = "address";
    confidence = 74;
  } else if (sim >= 70) {
    method = "name_only";
    confidence = sim;
  }

  let status: EntityMatch["status"] = "NO_MATCH";
  if (method === "business_id" || method === "vat" || method === "lei" || method === "exact_name") status = "MATCH";
  else if (method === "domain" || (method === "distinctive_core" && confidence >= HIGH_IMPACT_MIN)) {
    status = "MATCH";
  } else if (method === "distinctive_core") {
    status = opts.alternatives && opts.alternatives > 1 ? "AMBIGUOUS" : confidence >= 86 ? "MATCH" : "AMBIGUOUS";
  } else if (method === "address" || method === "name_only") {
    status = "AMBIGUOUS";
  }

  return {
    sourceEntity: opts.source.name ?? opts.source.businessId ?? opts.source.lei ?? "unknown",
    identifiersMatched: identifiers,
    nameSimilarity: sim,
    addressMatch,
    domainMatch,
    confidence,
    method,
    status,
    reason:
      status === "MATCH"
        ? `Matched via ${method}`
        : status === "AMBIGUOUS"
          ? "More than one plausible entity; signal not attached"
          : "Insufficient identity evidence",
  };
}

export function mayAttachHighImpactSignal(match: EntityMatch): boolean {
  return match.status === "MATCH" && match.confidence >= HIGH_IMPACT_MIN && match.method !== "name_only";
}
