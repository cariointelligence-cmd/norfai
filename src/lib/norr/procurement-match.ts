import { coreCompanyName, isDistinctiveCoreName } from "./dedupe.ts";
import { normalizeName } from "./normalize.ts";
import { resolveEntityMatch, mayAttachHighImpactSignal } from "./entity-match.ts";

export type ProcurementMatch = {
  ok: boolean;
  confidence: number;
  reason: string;
};

const WEAK_THRESHOLD = 80;

export function procurementNameMatch(companyName: string, noticeName: string | null | undefined): ProcurementMatch {
  const entity = resolveEntityMatch({
    company: { name: companyName },
    source: { name: noticeName ?? "" },
  });
  if (entity.status === "AMBIGUOUS") {
    return { ok: false, confidence: entity.confidence, reason: "ambiguous name match" };
  }
  if (mayAttachHighImpactSignal(entity) || (entity.status === "MATCH" && entity.confidence >= WEAK_THRESHOLD)) {
    return { ok: true, confidence: entity.confidence, reason: entity.method };
  }
  const a = normalizeName(companyName);
  const b = normalizeName(noticeName ?? "");
  if (!a || !b) return { ok: false, confidence: 0, reason: "missing name" };
  if (a === b) return { ok: true, confidence: 96, reason: "exact normalized name" };
  const ca = coreCompanyName(companyName);
  const cb = coreCompanyName(noticeName ?? "");
  if (ca && cb && ca === cb && isDistinctiveCoreName(ca)) {
    return { ok: true, confidence: 90, reason: "distinctive core name" };
  }
  if (ca && cb && ca.length >= 8 && (ca.includes(cb) || cb.includes(ca))) {
    const confidence = 72;
    return { ok: confidence >= WEAK_THRESHOLD, confidence, reason: "substring core" };
  }
  return { ok: false, confidence: entity.nameSimilarity, reason: "weak name similarity" };
}

export function shouldAttachProcurement(match: ProcurementMatch): boolean {
  return match.ok && match.confidence >= WEAK_THRESHOLD;
}