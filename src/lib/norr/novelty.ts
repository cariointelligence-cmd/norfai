import type { SearchCriteria } from "./types.ts";
import { ENGINE_SEARCH_CEILING } from "./platform.ts";

export type ExposureSnapshot = {
  timesSeen: number;
  lastSeenAt: string | null;
  timesExported: number;
};

const DAY = 86_400_000;

/** Never-seen = 1. Recent heavy reuse approaches 0.05. Never zero, so relevance can still win. */
export function noveltyScore(snap: ExposureSnapshot | null | undefined, now = Date.now()): number {
  if (!snap || snap.timesSeen <= 0) return 1;
  const last = snap.lastSeenAt ? new Date(snap.lastSeenAt).getTime() : now;
  const days = Number.isFinite(last) ? Math.max(0, (now - last) / DAY) : 0;
  const recency =
    days >= 180 ? 0.85
    : days >= 90 ? 0.8
    : days >= 30 ? 0.55
    : days >= 14 ? 0.4
    : days >= 3 ? 0.3
    : 0.18;
  const volume = snap.timesSeen >= 8 ? 0.08 : snap.timesSeen >= 4 ? 0.2 : snap.timesSeen >= 2 ? 0.45 : 0.7;
  const exportedPenalty = snap.timesExported > 0 ? 0.85 : 1;
  return Math.max(0.05, Math.min(1, recency * volume * exportedPenalty));
}

export function finalRankScore(opts: {
  searchScore: number;
  novelty: number;
  prioritizeNew?: boolean;
  diversityPenalty?: number;
}): number {
  const search = Math.max(0, Math.min(100, opts.searchScore));
  const nov = Math.max(0, Math.min(1, opts.novelty));
  const div = Math.max(0, Math.min(12, opts.diversityPenalty ?? 0));
  const prioritize = opts.prioritizeNew !== false;
  const mixed = prioritize ? search * 0.72 + nov * 100 * 0.28 : search + nov * 4;
  return Math.round((mixed - div) * 100) / 100;
}

export function exhaustionScore(opts: {
  requested: number;
  newCount: number;
  seenCount: number;
  excludedCount?: number;
}): number {
  const total = opts.newCount + opts.seenCount;
  if (total <= 0) return 0;
  const requested = Math.max(1, opts.requested);
  const unseenShare = opts.newCount / total;
  const fill = Math.min(1, total / requested);
  const reuse = 1 - unseenShare;
  const excluded = opts.excludedCount ?? 0;
  const hard = excluded > 0 && opts.newCount === 0 ? 1 : 0;
  return Math.round(Math.max(0, Math.min(100, reuse * 70 * fill + hard * 25 + (unseenShare < 0.2 ? 10 : 0))));
}

export function limitedNewWarning(opts: {
  requested: number;
  returned: number;
  seenCount: number;
  newCount: number;
}): { show: boolean; seenCount: number; returned: number; message: string } {
  const returned = opts.returned;
  const seen = opts.seenCount;
  const ratio = returned > 0 ? seen / returned : 0;
  const show = returned > 0 && seen >= 8 && ratio >= 0.6;
  return {
    show,
    seenCount: seen,
    returned,
    message: show
      ? `LIMITED NEW RESULTS. Most companies matching these filters have already appeared in your previous searches. ${seen} of ${returned} results have been shown before.`
      : "",
  };
}

export function discoverPoolSize(criteria: SearchCriteria): number {
  const want = Math.max(1, criteria.maxResults ?? 100);
  const ceiling = ENGINE_SEARCH_CEILING;
  if (skipPreviouslyShown(criteria) || criteria.excludeExported) return Math.min(Math.max(want * 4, want + 80), ceiling);
  return Math.min(want, ceiling);
}

export function diversityPenalty(opts: {
  municipality: string | null;
  industry: string | null;
  picked: Array<{ municipality: string | null; industry: string | null }>;
}): number {
  if (!opts.picked.length) return 0;
  const mun = (opts.municipality ?? "").toLowerCase();
  const ind = (opts.industry ?? "").slice(0, 2);
  let munN = 0;
  let indN = 0;
  for (const p of opts.picked) {
    if (mun && (p.municipality ?? "").toLowerCase() === mun) munN += 1;
    if (ind && (p.industry ?? "").slice(0, 2) === ind) indN += 1;
  }
  const munShare = munN / opts.picked.length;
  const indShare = indN / opts.picked.length;
  let pen = 0;
  if (mun && munShare >= 0.45) pen += 4;
  if (ind && indShare >= 0.7) pen += 3;
  return pen;
}

/** Repeats only if the user turns off both novelty controls. Default is skip already shown companies. */
export function skipPreviouslyShown(criteria: SearchCriteria): boolean {
  if (criteria.excludeSeen) return true;
  return criteria.prioritizeNew !== false;
}

/** A discover slice is done only when the cap is filled, quota stopped, or the register was fully scanned. */
export function discoverSliceComplete(opts: {
  kept: number;
  want: number;
  timedOut: boolean;
  quotaStopped: boolean;
  registerExhausted: boolean;
}): boolean {
  if (opts.quotaStopped || opts.kept >= opts.want) return true;
  if (opts.timedOut) return false;
  return opts.registerExhausted;
}

/** How many unseen matches the register should still return this slice. */
export function discoverFillTarget(kept: number, want: number): number {
  const remaining = Math.max(0, want - kept);
  if (remaining <= 0) return 1;
  return remaining + Math.min(60, remaining);
}

/** Reopen discovery when a run finished under the requested cap without scanning the whole register. */
export function shouldResumeDiscover(opts: {
  status: string;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  kept: number;
  want: number;
  discoverOpen: boolean;
  registerScannedAll?: boolean;
  resumeCount?: number;
}): boolean {
  if (opts.cancelRequested || opts.pauseRequested) return false;
  if (opts.status === "cancelled" || opts.status === "failed" || opts.status === "paused") return false;
  if (opts.kept >= opts.want) return false;
  if (opts.discoverOpen) return false;
  if (opts.registerScannedAll) {
    if ((opts.resumeCount ?? 0) >= 1) return false;
    if (opts.kept >= Math.ceil(opts.want * 0.5)) return false;
  }
  return true;
}

/**
 * First pass treated PRH STATUS3=2 as dead and stored nothing while the
 * register still had tens of thousands of rows. Restart that scan once.
 * Do not restart when skip-seen actually excluded candidates.
 */
export function shouldResetDiscoverCursor(opts: {
  kept: number;
  registerHits: number;
  excludedSeen?: number;
  alreadyRescanned?: boolean;
}): boolean {
  if (opts.alreadyRescanned) return false;
  if (opts.kept > 0) return false;
  if (!Number.isFinite(opts.registerHits) || opts.registerHits <= 0) return false;
  if ((opts.excludedSeen ?? 0) > 0) return false;
  return true;
}

export function maxRegisterHits(report: Array<{ registerHits?: number }> | null | undefined): number {
  if (!Array.isArray(report)) return 0;
  let max = 0;
  for (const row of report) {
    const n = Number(row?.registerHits ?? 0);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Keep earlier source hits when a later slice stores zero. Never let a 0-hit slice wipe the register. */
export function mergeSourceReports(
  prev: Array<Record<string, unknown>> | null | undefined,
  next: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const index = new Map<string, number>();
  const take = (row: Record<string, unknown>) => {
    const key = String(row.source ?? "");
    if (!key) {
      out.push({ ...row });
      return;
    }
    const i = index.get(key);
    if (i == null) {
      index.set(key, out.length);
      out.push({ ...row });
      return;
    }
    const cur = out[i]!;
    const hits = Number(cur.hits ?? 0) + Number(row.hits ?? 0);
    const registerHits = Math.max(Number(cur.registerHits ?? 0) || 0, Number(row.registerHits ?? 0) || 0);
    const ok = Boolean(cur.ok) || Boolean(row.ok) || hits > 0;
    out[i] = {
      ...cur,
      ...row,
      hits,
      registerHits,
      ok,
      error: ok ? undefined : (row.error ?? cur.error),
      code: row.code ?? cur.code,
      note: row.note ?? cur.note,
    };
  };
  for (const row of prev ?? []) {
    if (row && typeof row === "object") take(row);
  }
  for (const row of next) {
    if (row && typeof row === "object") take(row);
  }
  return out;
}

export function emptyNewLeadsMessage(excludeSeen: boolean): string {
  if (excludeSeen) {
    return "No new companies currently match these filters. Previously shown companies were excluded as requested.";
  }
  return "No companies matched every filter.";
}

/** Final empty-new banner only after discovery finished. While a search is running, skip-seen looks like a broken register. */
export function showEmptyNewBanner(opts: {
  excludeSeen: boolean;
  companyCount: number;
  status: string;
}): boolean {
  if (!opts.excludeSeen || opts.companyCount > 0) return false;
  if (opts.status === "running" || opts.status === "queued") return false;
  return true;
}

export function shouldHardExclude(
  criteria: SearchCriteria,
  snap: ExposureSnapshot | null | undefined,
): "seen" | "exported" | null {
  if (criteria.excludeExported && snap && snap.timesExported > 0) return "exported";
  if (skipPreviouslyShown(criteria) && snap && snap.timesSeen > 0) return "seen";
  return null;
}

export function collectHardExcludeBids(
  rows: Iterable<{ business_id?: string | null; times_seen: number; last_seen_at: string | null; times_exported: number }>,
  criteria: SearchCriteria,
): string[] {
  const bids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const bid = row.business_id;
    if (!bid || seen.has(bid)) continue;
    if (!shouldHardExclude(criteria, {
      timesSeen: row.times_seen,
      lastSeenAt: row.last_seen_at,
      timesExported: row.times_exported,
    })) continue;
    seen.add(bid);
    bids.push(bid);
  }
  return bids;
}
