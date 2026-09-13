import type { SourceState } from "../types.ts";
import {
  displayState,
  initialState,
  NETWORK_ENGINES,
  productLabel,
  productName,
  publicSourceView,
  SOURCE_CATALOG,
  type SourceDef,
} from "../sources/catalog.ts";

export type HiveHeartbeat = {
  sourceId: string;
  state: SourceState;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastLatencyMs: number | null;
  lastTestOk: boolean | null;
  lastTestDetail: string | null;
  lastTestAt: string | null;
};

export type HealthRow = {
  source_id: string;
  state?: string | null;
  enabled?: boolean | null;
  last_success_at?: string | Date | null;
  last_latency_ms?: number | null;
  last_test_ok?: boolean | null;
  last_test_detail?: string | null;
  last_test_at?: string | Date | null;
};

function asIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

export function heartbeatOf(row: HealthRow): HiveHeartbeat {
  return {
    sourceId: row.source_id,
    state: displayState((row.state ?? "connected") as SourceState),
    enabled: row.enabled !== false,
    lastSuccessAt: asIso(row.last_success_at ?? null),
    lastLatencyMs: typeof row.last_latency_ms === "number" ? row.last_latency_ms : null,
    lastTestOk: typeof row.last_test_ok === "boolean" ? row.last_test_ok : null,
    lastTestDetail: typeof row.last_test_detail === "string" ? row.last_test_detail : null,
    lastTestAt: asIso(row.last_test_at ?? null),
  };
}

export function latestHeartbeat(rows: HealthRow[]): HiveHeartbeat | null {
  const beats = rows.map(heartbeatOf).filter((b) => b.lastSuccessAt);
  beats.sort((a, b) => String(b.lastSuccessAt).localeCompare(String(a.lastSuccessAt)));
  return beats[0] ?? null;
}

function liveStateFor(def: SourceDef, beat: HiveHeartbeat | undefined): SourceState {
  const catalog = initialState(def);
  if (beat && beat.enabled === false) return "optional_offline";
  if (catalog === "optional_offline" || catalog === "not_implemented" || catalog === "missing_credentials") return displayState(catalog);
  if (beat?.state === "temporarily_unavailable" || beat?.state === "rate_limited") return beat.state;
  if (beat?.lastTestOk === false) return "temporarily_unavailable";
  return catalog;
}

export function hiveNetworkSnapshot(healthRows: HealthRow[]) {
  const beats = new Map(healthRows.map((row) => [row.source_id, heartbeatOf(row)]));
  const engines = NETWORK_ENGINES.map((engine) => {
    const members = engine.sourceIds
      .map((id) => SOURCE_CATALOG.find((s) => s.id === id))
      .filter((s): s is SourceDef => Boolean(s));
    const sources = members.map((def) => {
      const beat = beats.get(def.id);
      const state = liveStateFor(def, beat);
      return {
        id: def.id,
        name: productName(def),
        countries: def.countries,
        state,
        enabled: beat ? beat.enabled : true,
        lastSuccessAt: beat?.lastSuccessAt ?? null,
        lastLatencyMs: beat?.lastLatencyMs ?? null,
        lastTestDetail: beat?.lastTestDetail ?? null,
        product: productLabel(state),
      };
    });
    const live = sources.filter((s) => s.state === "connected" && s.enabled);
    const degraded = sources.some((s) => s.state === "temporarily_unavailable" || s.state === "rate_limited");
    const status: SourceState = live.length
      ? degraded
        ? "temporarily_unavailable"
        : "connected"
      : engine.core
        ? "temporarily_unavailable"
        : "optional_offline";
    return {
      id: engine.id,
      label: engine.label,
      blurb: engine.blurb,
      core: engine.core,
      sources,
      online: live.length,
      total: sources.length,
      status,
    };
  });
  const sources = SOURCE_CATALOG.filter((s) => s.open && s.implemented).map((s) => {
    const row = healthRows.find((h) => h.source_id === s.id) ?? null;
    const beat = row ? heartbeatOf(row) : undefined;
    return publicSourceView(s, liveStateFor(s, beat), row as Record<string, unknown> | null);
  });
  return {
    engines,
    sources,
    last: latestHeartbeat(healthRows),
    generatedAt: new Date().toISOString(),
    livePath: {
      sensor: "ytj",
      memory: "companies",
      cortex: "score",
      face: "/sources",
    },
  };
}
