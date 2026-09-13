export type QuotaDecision =
  | { action: "reuse"; reason: string }
  | { action: "reserve"; units: number }
  | { action: "commit"; units: number }
  | { action: "refund"; units: number; reason: string }
  | { action: "skip_charge"; reason: string };

export function exportSearchUnits(rowCount: number): number {
  void rowCount;
  return 0;
}

export function searchShouldChargeBeforeInsert(opts: { reused: boolean; cost: number }): QuotaDecision {
  if (opts.reused) return { action: "reuse", reason: "Identical search already running" };
  return { action: "reserve", units: Math.max(1, opts.cost) };
}

export function searchRefundReason(opts: {
  infrastructureFailed: boolean;
  zeroMatches: boolean;
}): QuotaDecision | null {
  if (opts.infrastructureFailed) return { action: "refund", units: 0, reason: "Infrastructure failure" };
  if (opts.zeroMatches) return { action: "commit", units: 1 };
  return null;
}

export function usageModelCopy(): { searches: string; leads: string; exports: string } {
  return {
    searches: "One search start consumes 1 search unit (10 for deep search). Failed infrastructure starts are refunded.",
    leads: "A lead is a stored company row. The same Y-tunnus is not stored twice.",
    exports: "CSV export uses the daily row cap. It does not consume search units.",
  };
}
