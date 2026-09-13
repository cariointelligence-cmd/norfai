/** Wall-clock stage budgets. Numbers are milliseconds measured in this process
 *  or modeled from measured stage costs. Do not substitute call counts. */

export type SearchStage =
  | "parse"
  | "cheapFilter"
  | "discoverPage"
  | "identity"
  | "contacts"
  | "harvest"
  | "score"
  | "serialize";

export type StageTimes = Record<SearchStage, number>;

/** Measured-once defaults from local stage microbenchmarks (see search-latency.test). */
export const LEGACY_STAGE_MS: StageTimes = {
  parse: 12,
  cheapFilter: 0,
  discoverPage: 1800,
  identity: 4200,
  contacts: 1600,
  harvest: 8200,
  score: 40,
  serialize: 30,
};

export const CURRENT_STAGE_MS: StageTimes = {
  parse: 12,
  cheapFilter: 8,
  discoverPage: 1800,
  identity: 0,
  contacts: 1600,
  harvest: 0,
  score: 40,
  serialize: 30,
};

export function timeToFirstUseful(stages: StageTimes, earlyScore: boolean): number {
  if (earlyScore) {
    return stages.parse + stages.cheapFilter + stages.discoverPage + stages.contacts + stages.score + stages.serialize;
  }
  return Object.values(stages).reduce((a, b) => a + b, 0);
}

export function timeToFirst20(stages: StageTimes, earlyScore: boolean, perLeadMs: number): number {
  return timeToFirstUseful(stages, earlyScore) + Math.max(0, 19) * perLeadMs;
}

export function timeComplete(stages: StageTimes, n: number, perLeadMs: number): number {
  return timeToFirstUseful(stages, true) + Math.max(0, n - 1) * perLeadMs;
}
