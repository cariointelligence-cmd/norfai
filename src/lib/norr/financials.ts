import type { Evidence, ValueClass } from "./evidence.ts";
import { evidence } from "./evidence.ts";

export const FINANCIAL_RANK: Record<string, number> = {
  prh_xbrl: 100,
  official_register: 95,
  esef_xbrl: 92,
  wikidata: 55,
  kauppalehti: 40,
  northdata: 38,
  website: 20,
  inferred: 5,
};

export type FinancialFact = {
  revenue: number | null;
  profit: number | null;
  year: string | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  equityRatio: number | null;
  source: string;
  sourceUrl?: string | null;
  currency: string;
  method: string;
  valueClass: ValueClass;
};

export function rankOf(sourceId: string | null | undefined): number {
  if (!sourceId) return 0;
  return FINANCIAL_RANK[sourceId] ?? 10;
}

/** Official structured > reliable third party > HTML extraction > inference. */
export function preferFinancial(
  current: { source: string | null | undefined; revenue: number | null | undefined },
  incoming: { source: string; revenue: number | null },
): boolean {
  if (incoming.revenue == null) return false;
  if (current.revenue == null) return true;
  return rankOf(incoming.source) > rankOf(current.source);
}

export function deriveEquityRatio(equity: number | null, assets: number | null): number | null {
  if (equity == null || assets == null) return null;
  if (!(assets > 0) || !Number.isFinite(equity) || !Number.isFinite(assets)) return null;
  const ratio = equity / assets;
  if (!Number.isFinite(ratio) || ratio < -2 || ratio > 2) return null;
  return Math.round(ratio * 1000) / 1000;
}

export function financialGrowthYoY(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (!(previous > 0) || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 1000;
}

export function toFinancialEvidence(fact: FinancialFact, field: "revenue" | "profit" | "equity" | "equityRatio"): Evidence | null {
  const value = fact[field];
  if (value == null) return null;
  return evidence({
    value,
    type: fact.valueClass,
    source: fact.source,
    sourceUrlOrReference: fact.sourceUrl ?? null,
    confidence: rankOf(fact.source),
    method: fact.method,
    period: fact.year,
    currency: field === "equityRatio" ? null : fact.currency,
  });
}

export function emptyFinancialFact(source = "unknown"): FinancialFact {
  return {
    revenue: null,
    profit: null,
    year: null,
    equity: null,
    assets: null,
    liabilities: null,
    equityRatio: null,
    source,
    sourceUrl: null,
    currency: "EUR",
    method: "none",
    valueClass: "UNKNOWN",
  };
}
