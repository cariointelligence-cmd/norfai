import { FINANCIAL_RANK, deriveEquityRatio, financialGrowthYoY, rankOf, type FinancialFact } from "./financials.ts";
import type { ValueClass } from "./evidence.ts";

export type ConflictState = "NONE" | "CONFLICTING" | "INCOMPARABLE";

export type FinancialPeriod = {
  revenue: number | null;
  profit: number | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  equityRatio: number | null;
  year: string | null;
  periodEnd: string | null;
  periodLengthDays: number | null;
  currency: string;
  source: string;
  sourceUrl: string | null;
  sourceAuthority: number;
  observedAt: string;
  valueClass: ValueClass;
  confidence: number;
};

export type FusedFinancials = {
  latest: FinancialPeriod | null;
  previous: FinancialPeriod | null;
  revenueGrowth: number | null;
  growthWarning: string | null;
  conflictState: ConflictState;
  conflictNote: string | null;
  rejected: FinancialPeriod[];
};

export function periodLengthDays(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
}

export function periodsComparable(a: FinancialPeriod, b: FinancialPeriod): { ok: boolean; reason: string | null } {
  if (a.currency && b.currency && a.currency !== b.currency) {
    return { ok: false, reason: `Currencies differ (${a.currency} vs ${b.currency})` };
  }
  if (a.periodLengthDays && b.periodLengthDays) {
    const ratio = a.periodLengthDays / b.periodLengthDays;
    if (ratio < 0.85 || ratio > 1.15) {
      return { ok: false, reason: "Reporting periods are not comparable in length" };
    }
  }
  return { ok: true, reason: null };
}

export function toPeriod(fact: FinancialFact, observedAt = new Date().toISOString()): FinancialPeriod {
  return {
    revenue: fact.revenue,
    profit: fact.profit,
    equity: fact.equity,
    assets: fact.assets,
    liabilities: fact.liabilities,
    equityRatio: fact.equityRatio ?? deriveEquityRatio(fact.equity, fact.assets),
    year: fact.year,
    periodEnd: fact.year,
    periodLengthDays: null,
    currency: fact.currency || "EUR",
    source: fact.source,
    sourceUrl: fact.sourceUrl ?? null,
    sourceAuthority: rankOf(fact.source),
    observedAt,
    valueClass: fact.valueClass,
    confidence: rankOf(fact.source),
  };
}

/** Official structured wins when comparable. Conflicts are recorded, never silently overwritten. */
export function fuseFinancials(periods: FinancialPeriod[]): FusedFinancials {
  const usable = periods.filter((p) => p.revenue != null || p.profit != null || p.equity != null);
  usable.sort((a, b) => {
    const ya = Number(a.year ?? 0);
    const yb = Number(b.year ?? 0);
    if (yb !== ya) return yb - ya;
    return b.sourceAuthority - a.sourceAuthority;
  });
  const byYear = new Map<string, FinancialPeriod[]>();
  for (const p of usable) {
    const y = p.year ?? "unknown";
    const list = byYear.get(y) ?? [];
    list.push(p);
    byYear.set(y, list);
  }
  let conflictState: ConflictState = "NONE";
  let conflictNote: string | null = null;
  const rejected: FinancialPeriod[] = [];
  const primaryByYear: FinancialPeriod[] = [];
  for (const [, list] of byYear) {
    list.sort((a, b) => b.sourceAuthority - a.sourceAuthority);
    const winner = list[0]!;
    primaryByYear.push(winner);
    for (const other of list.slice(1)) {
      if (winner.revenue != null && other.revenue != null && Math.abs(winner.revenue - other.revenue) / Math.max(winner.revenue, 1) > 0.15) {
        conflictState = "CONFLICTING";
        conflictNote = `${winner.source} revenue ${winner.revenue} vs ${other.source} ${other.revenue} (${winner.year ?? "period unknown"})`;
        rejected.push(other);
      }
    }
  }
  primaryByYear.sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0));
  const latest = primaryByYear[0] ?? null;
  const previous = primaryByYear[1] ?? null;
  let revenueGrowth: number | null = null;
  let growthWarning: string | null = null;
  if (latest && previous) {
    const cmp = periodsComparable(latest, previous);
    if (!cmp.ok) {
      conflictState = conflictState === "CONFLICTING" ? "CONFLICTING" : "INCOMPARABLE";
      growthWarning = cmp.reason;
    } else {
      revenueGrowth = financialGrowthYoY(latest.revenue, previous.revenue);
    }
  }
  return { latest, previous, revenueGrowth, growthWarning, conflictState, conflictNote, rejected };
}

export function financialEmptyReason(opts: {
  httpOk: boolean;
  httpStatus?: number;
  periodsListed: number;
  factsParsed: boolean;
}): "source_failed" | "no_filing" | "parser_empty" | "ok" {
  if (!opts.httpOk) return "source_failed";
  if (opts.periodsListed === 0) return "no_filing";
  if (!opts.factsParsed) return "parser_empty";
  return "ok";
}

export { FINANCIAL_RANK, rankOf };
