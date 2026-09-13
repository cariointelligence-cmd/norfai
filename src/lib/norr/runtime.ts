/**
 * Production-normal engine knobs.
 * I/O is always async and parallel. These numbers are the polite production
 * band: not serial, not a burst that burns search engines or one host.
 */
export const RUNTIME = {
  jobConcurrency: 16,
  jobConcurrencyCap: 16,
  workerJobConcurrency: 16,
  workerMaxMs: 28_000,
  workerUserLimit: 8,
  workerUserConcurrency: 4,
  tickConcurrency: 10,
  tickMaxMs: 15_000,
  startTickConcurrency: 8,
  startTickMaxMs: 12_000,

  harvestPageConcurrency: 4,
  probeConcurrency: 6,
  webSearchTimeoutMs: 7_000,
  googleSearchTimeoutMs: 6_500,
  findCompanyQueryCap: 4,
  crawlBudget: 6,
  deepCrawlBudget: 12,
  harvestBudget: 24,
  harvestBudgetFastMax: 16,
  harvestBudgetFastMin: 6,
  harvestBudgetMin: 8,
  harvestBudgetMax: 36,
  discoverBudgetMs: 10_000,
  ytjPageBatch: 4,
  ddgQueryLimit: 6,
  domainGuessCap: 6,
  extraCrawlCap: 4,
  poolCap: 24,
  homemadeDiscoverCap: 40,
  hydrateConcurrency: 6,

  jobStealSeconds: 20,
  discoverStealMinutes: 0,
} as const;

export type RuntimeConfig = typeof RUNTIME;

export function jobLeaseSeconds(type: string, cfg: RuntimeConfig = RUNTIME): number {
  if (type === "discover") return 20;
  return Math.max(20, cfg.jobStealSeconds);
}

export function staleLockSeconds(type: string, cfg: RuntimeConfig = RUNTIME): number {
  return jobLeaseSeconds(type, cfg);
}

export function clampConcurrency(n: number | undefined, fallback = RUNTIME.jobConcurrency): number {
  const v = Number.isFinite(n) ? Number(n) : fallback;
  return Math.min(RUNTIME.jobConcurrencyCap, Math.max(1, Math.round(v)));
}

export function isProductionRuntime(cfg: RuntimeConfig = RUNTIME): boolean {
  return (
    cfg.jobConcurrency >= 8 &&
    cfg.jobConcurrency <= cfg.jobConcurrencyCap &&
    cfg.jobConcurrencyCap <= 16 &&
    cfg.workerUserConcurrency >= 2 &&
    cfg.workerUserConcurrency <= 8 &&
    cfg.harvestPageConcurrency >= 3 &&
    cfg.harvestPageConcurrency <= 6 &&
    cfg.probeConcurrency >= 4 &&
    cfg.probeConcurrency <= 8 &&
    cfg.crawlBudget >= 4 &&
    cfg.crawlBudget <= 8 &&
    cfg.deepCrawlBudget >= 8 &&
    cfg.deepCrawlBudget <= 16 &&
    cfg.findCompanyQueryCap >= 3 &&
    cfg.findCompanyQueryCap <= 6 &&
    cfg.poolCap >= 16
  );
}
