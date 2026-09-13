export type TraceStage =
  | "parse"
  | "plan"
  | "discover"
  | "source"
  | "resolve"
  | "filter"
  | "score"
  | "ai"
  | "response";

export type StageRecord = {
  stage: TraceStage;
  startedAt: number;
  endedAt?: number;
  latencyMs?: number;
  error?: string | null;
  recordCount?: number;
  sourceCount?: number;
  unknownCriteria?: number;
  resultCount?: number;
};

export type SearchTrace = {
  correlationId: string;
  runId?: string | null;
  startedAt: number;
  stages: StageRecord[];
};

export function newCorrelationId(runId?: string | null): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `norf_${(runId ?? "run").slice(0, 8)}_${rand}`;
}

export function startTrace(runId?: string | null): SearchTrace {
  return { correlationId: newCorrelationId(runId), runId: runId ?? null, startedAt: Date.now(), stages: [] };
}

export function markStage(trace: SearchTrace, stage: TraceStage, extra?: Partial<StageRecord>): StageRecord {
  const rec: StageRecord = { stage, startedAt: Date.now(), ...extra };
  trace.stages.push(rec);
  return rec;
}

export function endStage(rec: StageRecord, extra?: Partial<StageRecord>): StageRecord {
  rec.endedAt = Date.now();
  rec.latencyMs = rec.endedAt - rec.startedAt;
  if (extra) Object.assign(rec, extra);
  return rec;
}

export function traceSummary(trace: SearchTrace): {
  correlationId: string;
  totalMs: number;
  errors: string[];
  stages: Array<{ stage: TraceStage; latencyMs: number | null; error?: string | null }>;
} {
  return {
    correlationId: trace.correlationId,
    totalMs: Date.now() - trace.startedAt,
    errors: trace.stages.map((s) => s.error).filter((e): e is string => Boolean(e)),
    stages: trace.stages.map((s) => ({ stage: s.stage, latencyMs: s.latencyMs ?? null, error: s.error ?? null })),
  };
}
