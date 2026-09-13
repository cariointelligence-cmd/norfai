/** Semantic layer: never present FACT, SIGNAL and HEURISTIC with the same certainty. */

export const VALUE_CLASSES = ["FACT", "OBSERVATION", "SIGNAL", "INFERENCE", "HEURISTIC", "UNKNOWN"] as const;
export type ValueClass = (typeof VALUE_CLASSES)[number];

export const SCORE_STATES = ["NOT_EVALUATED", "INSUFFICIENT_DATA", "EVALUATED"] as const;
export type ScoreState = (typeof SCORE_STATES)[number];

export type Evidence = {
  value: unknown;
  type: ValueClass;
  source: string;
  sourceUrlOrReference?: string | null;
  observedAt?: string | null;
  sourceUpdatedAt?: string | null;
  confidence: number | null;
  method: string;
  period?: string | null;
  currency?: string | null;
};

export function evidence(partial: Omit<Evidence, "confidence"> & { confidence?: number | null }): Evidence {
  return {
    ...partial,
    confidence: partial.confidence ?? null,
    sourceUrlOrReference: partial.sourceUrlOrReference ?? null,
    observedAt: partial.observedAt ?? null,
    sourceUpdatedAt: partial.sourceUpdatedAt ?? null,
    period: partial.period ?? null,
    currency: partial.currency ?? null,
  };
}

export function scoreState(value: number | null | undefined, evaluated: boolean): ScoreState {
  if (!evaluated) return "NOT_EVALUATED";
  if (value == null || !Number.isFinite(Number(value))) return "INSUFFICIENT_DATA";
  return "EVALUATED";
}

export function meanReliability(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
