/**
 * Nerve + Immune for the job queue.
 * A 300-company search must not sit invisible at 6000 live jobs.
 * The worker tick snapshots depth, classifies pressure, retires leftover
 * child crawls globally, and steals stale locks — before claiming work.
 */
import type { Sql } from "@/lib/db";
import { RUNTIME, jobLeaseSeconds } from "./runtime.ts";

export const QUEUE_HEALTHY_MAX = 400;
export const QUEUE_OVERLOAD_MIN = 1500;
export const QUEUE_CHILD_OVERLOAD = 20;
export const QUEUE_OLDEST_ELEVATED_MS = 5 * 60 * 1000;
export const QUEUE_OLDEST_OVERLOAD_MS = 15 * 60 * 1000;
export const QUEUE_SNAPSHOT_MIN_MS = 15_000;
export const QUEUE_SNAPSHOT_KEEP_HOURS = 48;

export type QueuePressure = "idle" | "healthy" | "elevated" | "overloaded";

export type QueueTypeCount = { type: string; queued: number; running: number };

export type QueueSnapshot = {
  queued: number;
  running: number;
  depth: number;
  oldestQueuedMs: number | null;
  childCrawls: number;
  staleRunning: number;
  users: number;
  runs: number;
  byType: QueueTypeCount[];
  pressure: QueuePressure;
  takenAt: string;
  pruned: number;
  stolen: number;
};

export type QueueRow = {
  type?: string | null;
  status?: string | null;
  n?: number | null;
  oldest_s?: number | null;
};

const globalRef = globalThis as typeof globalThis & {
  __norfQueueMon__?: { lastPersistAt: number; lastPressure: string; lastDepth: number };
};

function slot() {
  globalRef.__norfQueueMon__ ??= { lastPersistAt: 0, lastPressure: "", lastDepth: -1 };
  return globalRef.__norfQueueMon__;
}

export function classifyQueuePressure(input: {
  queued: number;
  running: number;
  childCrawls: number;
  oldestQueuedMs: number | null;
  staleRunning: number;
}): QueuePressure {
  const queued = Math.max(0, Number(input.queued) || 0);
  const running = Math.max(0, Number(input.running) || 0);
  const depth = queued + running;
  const children = Math.max(0, Number(input.childCrawls) || 0);
  const stale = Math.max(0, Number(input.staleRunning) || 0);
  const oldest = input.oldestQueuedMs != null && Number.isFinite(input.oldestQueuedMs)
    ? Math.max(0, input.oldestQueuedMs)
    : null;
  if (depth === 0 && children === 0 && stale === 0) return "idle";
  if (
    depth >= QUEUE_OVERLOAD_MIN ||
    children >= QUEUE_CHILD_OVERLOAD ||
    stale >= 24 ||
    (oldest != null && oldest >= QUEUE_OLDEST_OVERLOAD_MS && depth >= QUEUE_HEALTHY_MAX)
  ) {
    return "overloaded";
  }
  if (
    depth >= QUEUE_HEALTHY_MAX ||
    children > 0 ||
    stale > 0 ||
    (oldest != null && oldest >= QUEUE_OLDEST_ELEVATED_MS)
  ) {
    return "elevated";
  }
  return "healthy";
}

export function shouldRetireChildCrawls(childCrawls: number): boolean {
  return Math.max(0, Number(childCrawls) || 0) > 0;
}

export function shouldForceDrainOptional(input: {
  pressure: QueuePressure;
  oldestQueuedMs: number | null;
  depth: number;
}): boolean {
  if (input.pressure === "overloaded") return true;
  if (input.depth >= QUEUE_HEALTHY_MAX) return true;
  const oldest = input.oldestQueuedMs;
  return oldest != null && oldest >= 10 * 60 * 1000;
}

/** Core work that must finish even after the original search page looks complete. */
export const CORE_LIVE_JOB_TYPES = ["discover", "enrich", "email"] as const;

export function isCoreLiveJobType(type: string | null | undefined): boolean {
  return (CORE_LIVE_JOB_TYPES as readonly string[]).includes(String(type ?? ""));
}

export function shouldRetireFinishedRunJob(
  runStatus: string | null | undefined,
  jobStatus: string | null | undefined,
  jobType?: string | null,
): boolean {
  const run = String(runStatus ?? "");
  const job = String(jobStatus ?? "");
  if (!(run === "completed" || run === "cancelled" || run === "failed")) return false;
  if (!(job === "queued" || job === "running")) return false;
  if (run === "completed" && isCoreLiveJobType(jobType)) return false;
  return true;
}

export function liveJobsPerRunCap(maxResults?: number | null): number {
  const want = Math.max(1, Number(maxResults) || 100);
  return Math.min(180, Math.max(24, want * 2 + 8));
}

export function shouldStealStaleLocks(staleRunning: number): boolean {
  return Math.max(0, Number(staleRunning) || 0) > 0;
}

export function shouldPersistQueueSnapshot(opts: {
  now: number;
  lastPersistAt: number;
  pressure: QueuePressure;
  lastPressure: string;
  depth: number;
  lastDepth: number;
}): boolean {
  if (!opts.lastPersistAt) return true;
  if (opts.pressure !== opts.lastPressure) return true;
  if (Math.abs(opts.depth - opts.lastDepth) >= 50) return true;
  return opts.now - opts.lastPersistAt >= QUEUE_SNAPSHOT_MIN_MS;
}

export function liveQueueFromCounts(
  counts: Array<{ type?: string | null; status?: string | null; n?: number | null }> | null | undefined,
): { queued: number; running: number; depth: number } {
  let queued = 0;
  let running = 0;
  for (const row of counts ?? []) {
    const n = Math.max(0, Number(row.n ?? 0) || 0);
    const st = String(row.status ?? "");
    if (st === "queued") queued += n;
    else if (st === "running") running += n;
  }
  return { queued, running, depth: queued + running };
}

export function oldestQueuedMsFromJobs(
  jobs: Array<{ status?: string | null; created_at?: string | Date | null }> | null | undefined,
  now = Date.now(),
): number | null {
  let oldest: number | null = null;
  for (const j of jobs ?? []) {
    if (j.status !== "queued" && j.status !== "running") continue;
    const t = j.created_at instanceof Date ? j.created_at.getTime() : Date.parse(String(j.created_at ?? ""));
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age < 0) continue;
    if (oldest == null || age > oldest) oldest = age;
  }
  return oldest;
}

export function formatQueueAge(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return `${h} h`;
}

export function queuePressureLabel(pressure: QueuePressure): string {
  if (pressure === "idle") return "Idle";
  if (pressure === "healthy") return "Healthy";
  if (pressure === "elevated") return "Busy";
  return "Overloaded";
}

export function queuePressureTone(pressure: QueuePressure): "mute" | "good" | "warn" | "bad" {
  if (pressure === "idle") return "mute";
  if (pressure === "healthy") return "good";
  if (pressure === "elevated") return "warn";
  return "bad";
}

export function aggregateQueueRows(
  rows: QueueRow[],
  extra: {
    childCrawls?: number;
    staleRunning?: number;
    users?: number;
    runs?: number;
    takenAt?: string;
    pruned?: number;
    stolen?: number;
  } = {},
): QueueSnapshot {
  const byTypeMap = new Map<string, QueueTypeCount>();
  let queued = 0;
  let running = 0;
  let oldestQueuedS: number | null = null;
  for (const row of rows) {
    const n = Math.max(0, Number(row.n ?? 0) || 0);
    if (!n) continue;
    const type = String(row.type || "other");
    const st = String(row.status ?? "");
    const slot = byTypeMap.get(type) ?? { type, queued: 0, running: 0 };
    if (st === "queued") {
      queued += n;
      slot.queued += n;
      const age = Number(row.oldest_s);
      if (Number.isFinite(age) && (oldestQueuedS == null || age > oldestQueuedS)) oldestQueuedS = age;
    } else if (st === "running") {
      running += n;
      slot.running += n;
    } else {
      continue;
    }
    byTypeMap.set(type, slot);
  }
  const byType = Array.from(byTypeMap.values()).sort((a, b) => (b.queued + b.running) - (a.queued + a.running));
  const childCrawls = Math.max(0, Number(extra.childCrawls) || 0);
  const staleRunning = Math.max(0, Number(extra.staleRunning) || 0);
  const pressure = classifyQueuePressure({
    queued,
    running,
    childCrawls,
    oldestQueuedMs: oldestQueuedS == null ? null : oldestQueuedS * 1000,
    staleRunning,
  });
  return {
    queued,
    running,
    depth: queued + running,
    oldestQueuedMs: oldestQueuedS == null ? null : oldestQueuedS * 1000,
    childCrawls,
    staleRunning,
    users: Math.max(0, Number(extra.users) || 0),
    runs: Math.max(0, Number(extra.runs) || 0),
    byType,
    pressure,
    takenAt: extra.takenAt ?? new Date().toISOString(),
    pruned: Math.max(0, Number(extra.pruned) || 0),
    stolen: Math.max(0, Number(extra.stolen) || 0),
  };
}

export async function ensureQueueMonitorSchema(sql: Sql): Promise<void> {
  try {
    await sql.query(`create table if not exists worker_queue_snapshots (
      id text primary key,
      taken_at timestamptz not null default now(),
      queued integer not null default 0,
      running integer not null default 0,
      depth integer not null default 0,
      oldest_queued_ms integer,
      child_crawls integer not null default 0,
      stale_running integer not null default 0,
      users integer not null default 0,
      runs integer not null default 0,
      by_type jsonb not null default '[]',
      pressure text not null default 'idle',
      pruned integer not null default 0,
      stolen integer not null default 0
    )`);
    await sql.query(`create index if not exists worker_queue_snapshots_taken_idx on worker_queue_snapshots (taken_at desc)`);
  } catch {
    /* preview schema catch-up */
  }
}

export async function snapshotQueueDepth(sql: Sql): Promise<QueueSnapshot> {
  const rows = await sql<QueueRow>`
    select type, status, count(*)::int as n,
      extract(epoch from (now() - min(created_at)))::int as oldest_s
    from jobs
    where status in ('queued','running')
    group by type, status`;
  let childCrawls = 0;
  let staleRunning = 0;
  let users = 0;
  let runs = 0;
  try {
    const child = await sql<{ n: number }>`
      select count(*)::int as n from jobs
      where type = ${"crawl"} and status = ${"queued"}
        and coalesce(payload->>'seed', 'false') <> 'true'`;
    childCrawls = Number(child[0]?.n ?? 0) || 0;
  } catch {
    childCrawls = 0;
  }
  try {
    const stale = await sql<{ n: number }>`
      select count(*)::int as n from jobs
      where status = ${"running"} and locked_at is not null
        and locked_at < now() - make_interval(secs => ${jobLeaseSeconds("enrich")})`;
    staleRunning = Number(stale[0]?.n ?? 0) || 0;
  } catch {
    staleRunning = 0;
  }
  try {
    const who = await sql<{ users: number; runs: number }>`
      select count(distinct user_id)::int as users,
        count(distinct run_id)::int as runs
      from jobs where status in ('queued','running')`;
    users = Number(who[0]?.users ?? 0) || 0;
    runs = Number(who[0]?.runs ?? 0) || 0;
  } catch {
    users = 0;
    runs = 0;
  }
  return aggregateQueueRows(rows, { childCrawls, staleRunning, users, runs });
}

export async function sweepDeadQueue(sql: Sql): Promise<{ cancelled: number; closed: number; stolen: number }> {
  let cancelled = 0;
  let closed = 0;
  let stolen = 0;
  try {
    const dead = await sql<{ id: string }>`
      update jobs j set status = ${"cancelled"}, last_error = ${"no live search"},
        locked_at = null, updated_at = now()
      where j.status in ('queued','running')
        and (
          j.run_id is null
          or not exists (
            select 1 from search_runs r
            where r.id = j.run_id and r.status in ('running','queued')
          )
        )
      returning j.id`;
    cancelled += dead.length;
  } catch { /* */ }
  try {
    const stale = await sql<{ id: string }>`
      update jobs set status = ${"queued"}, locked_at = null, run_after = now(),
        last_error = ${"stolen stale lock"}, updated_at = now()
      where status = ${"running"}
        and locked_at is not null
        and locked_at < now() - interval '40 seconds'
      returning id`;
    stolen += stale.length;
  } catch { /* */ }
  try {
    const done = await sql<{ id: string }>`
      update search_runs r set status = ${"completed"}, finished_at = coalesce(finished_at, now())
      where r.status in ('running','queued')
        and r.updated_at < now() - interval '90 seconds'
        and not exists (
          select 1 from jobs j
          where j.run_id = r.id and j.status in ('queued','running')
        )
      returning r.id`;
    closed += done.length;
  } catch { /* */ }
  return { cancelled, closed, stolen };
}

export async function applyQueueImmune(
  sql: Sql,
  snap: QueueSnapshot,
): Promise<{ pruned: number; stolen: number }> {
  let pruned = 0;
  let stolen = 0;
  try {
    const sweep = await sweepDeadQueue(sql);
    pruned += sweep.cancelled;
    stolen += sweep.stolen;
  } catch { /* */ }
  try {
    const orphans = await sql<{ id: string }>`
      update jobs j set status = ${"cancelled"}, last_error = ${"run already finished"},
        locked_at = null, updated_at = now()
      from search_runs r
      where j.run_id = r.id
        and r.status in ('completed','cancelled','failed')
        and j.status in ('queued','running')
        and j.type not in ('discover','enrich','email')
      returning j.id`;
    pruned += orphans.length;
  } catch {
    /* schema catch-up */
  }
  if (shouldForceDrainOptional({
    pressure: snap.pressure,
    oldestQueuedMs: snap.oldestQueuedMs,
    depth: snap.depth,
  })) {
    try {
      const optional = await sql<{ id: string }>`
        update jobs set status = ${"cancelled"}, last_error = ${"queue overload drain"},
          locked_at = null, updated_at = now()
        where type in ('crawl','signals','scrape') and status in ('queued','running')
        returning id`;
      pruned += optional.length;
    } catch {
      /* keep */
    }
  }
  try {
    const staleRuns = await sql<{ id: string }>`
      update jobs j set status = ${"cancelled"}, last_error = ${"stale search drain"},
        locked_at = null, updated_at = now()
      from search_runs r
      where j.run_id = r.id
        and r.updated_at < now() - interval '20 minutes'
        and r.status in ('running','queued')
        and j.status in ('queued','running')
        and j.type not in ('discover','enrich','email')
        and not exists (
          select 1 from jobs c
          where c.run_id = r.id and c.status in ('queued','running')
            and c.type in ('discover','enrich','email')
        )
      returning j.id`;
    pruned += staleRuns.length;
    await sql`update search_runs r set status = ${"completed"}, finished_at = coalesce(finished_at, now())
      where r.status in ('running','queued')
        and r.updated_at < now() - interval '20 minutes'
        and not exists (
          select 1 from jobs j
          where j.run_id = r.id and j.status in ('queued','running')
            and j.type in ('discover','enrich','email')
        )`;
  } catch {
    /* keep */
  }
  if (shouldRetireChildCrawls(snap.childCrawls) || snap.depth > QUEUE_HEALTHY_MAX) {
    try {
      const retired = await sql<{ id: string }>`
        update jobs set status = ${"cancelled"}, last_error = ${"child crawl retired"},
          locked_at = null, updated_at = now()
        where type = ${"crawl"} and status in ('queued','running')
          and coalesce(payload->>'seed', 'false') <> 'true'
        returning id`;
      pruned += retired.length;
    } catch {
      /* keep */
    }
  }
  try {
    const staleOptional = await sql<{ id: string }>`
      update jobs set status = ${"cancelled"}, last_error = ${"stale optional job"},
        locked_at = null, updated_at = now()
      where type in ('crawl','signals') and status = ${"queued"}
        and created_at < now() - interval '8 minutes'
      returning id`;
    pruned += staleOptional.length;
  } catch {
    /* keep */
  }
  if (shouldStealStaleLocks(snap.staleRunning)) {
    try {
      const rows = await sql<{ id: string }>`
        update jobs set status = ${"queued"}, locked_at = null, updated_at = now(),
          last_error = ${"stolen stale lock"}
        where status = ${"running"} and locked_at is not null
          and (
            (type = ${"discover"} and locked_at < now() - make_interval(secs => ${jobLeaseSeconds("discover")}))
            or (type <> ${"discover"} and locked_at < now() - make_interval(secs => ${jobLeaseSeconds("enrich")}))
          )
        returning id`;
      stolen = rows.length;
    } catch {
      stolen = 0;
    }
  }
  return { pruned, stolen };
}

export async function drainStuckUserWork(sql: Sql, userId: string): Promise<{ cancelled: number; closed: number }> {
  let cancelled = 0;
  let closed = 0;
  try {
    await sql`update search_runs r set status = ${"running"}, finished_at = null
      where r.user_id = ${userId} and r.status = ${"completed"}
        and exists (
          select 1 from jobs j
          where j.run_id = r.id and j.user_id = ${userId}
            and j.status in ('queued','running')
            and j.type in ('discover','enrich','email')
        )`;
    const orphans = await sql<{ id: string }>`
      update jobs j set status = ${"cancelled"}, last_error = ${"run already finished"},
        locked_at = null, updated_at = now()
      from search_runs r
      where j.run_id = r.id and j.user_id = ${userId}
        and r.status in ('completed','cancelled','failed')
        and j.status in ('queued','running')
        and j.type not in ('discover','enrich','email')
      returning j.id`;
    cancelled += orphans.length;
  } catch { /* keep */ }
  try {
    const leftover = await sql<{ id: string }>`
      update jobs j set status = ${"cancelled"}, last_error = ${"stale search drain"},
        locked_at = null, updated_at = now()
      from search_runs r
      where j.run_id = r.id and j.user_id = ${userId}
        and r.updated_at < now() - interval '20 minutes'
        and r.status in ('running','queued')
        and j.status in ('queued','running')
        and j.type not in ('discover','enrich','email')
        and not exists (
          select 1 from jobs c
          where c.run_id = r.id and c.status in ('queued','running')
            and c.type in ('discover','enrich','email')
        )
      returning j.id`;
    cancelled += leftover.length;
    const done = await sql<{ id: string }>`
      update search_runs r set status = ${"completed"}, finished_at = coalesce(finished_at, now())
      where r.user_id = ${userId}
        and r.status in ('running','queued')
        and r.updated_at < now() - interval '20 minutes'
        and not exists (
          select 1 from jobs j
          where j.run_id = r.id and j.status in ('queued','running')
            and j.type in ('discover','enrich','email')
        )
      returning r.id`;
    closed = done.length;
  } catch { /* keep */ }
  return { cancelled, closed };
}

export async function persistQueueSnapshot(sql: Sql, snap: QueueSnapshot): Promise<boolean> {
  const s = slot();
  const now = Date.now();
  if (!shouldPersistQueueSnapshot({
    now,
    lastPersistAt: s.lastPersistAt,
    pressure: snap.pressure,
    lastPressure: s.lastPressure,
    depth: snap.depth,
    lastDepth: s.lastDepth,
  })) {
    return false;
  }
  await ensureQueueMonitorSchema(sql);
  try {
    const { nid } = await import("@/lib/utils");
    await sql`
      insert into worker_queue_snapshots (
        id, taken_at, queued, running, depth, oldest_queued_ms, child_crawls, stale_running,
        users, runs, by_type, pressure, pruned, stolen
      ) values (
        ${nid()}, now(), ${snap.queued}, ${snap.running}, ${snap.depth}, ${snap.oldestQueuedMs},
        ${snap.childCrawls}, ${snap.staleRunning}, ${snap.users}, ${snap.runs},
        ${JSON.stringify(snap.byType)}::jsonb, ${snap.pressure}, ${snap.pruned}, ${snap.stolen}
      )`;
  } catch {
    return false;
  }
  s.lastPersistAt = now;
  s.lastPressure = snap.pressure;
  s.lastDepth = snap.depth;
  if (Math.random() < 0.05) {
    try {
      await sql`delete from worker_queue_snapshots where taken_at < now() - make_interval(hours => ${QUEUE_SNAPSHOT_KEEP_HOURS})`;
    } catch {
      /* keep-window is best-effort */
    }
  }
  return true;
}

export async function loadRecentQueueSnapshots(sql: Sql, limit = 40): Promise<Array<{
  taken_at: string;
  queued: number;
  running: number;
  depth: number;
  oldest_queued_ms: number | null;
  child_crawls: number;
  stale_running: number;
  users: number;
  runs: number;
  pressure: string;
  pruned: number;
  stolen: number;
}>> {
  const cap = Math.min(80, Math.max(1, Math.round(limit)));
  try {
    return await sql`
      select taken_at, queued, running, depth, oldest_queued_ms, child_crawls, stale_running,
        users, runs, pressure, pruned, stolen
      from worker_queue_snapshots
      order by taken_at desc
      limit ${cap}`;
  } catch {
    return [];
  }
}

export function logQueueSnapshot(snap: QueueSnapshot): void {
  if (snap.pressure === "idle") return;
  console.info(
    "[norf-worker] queue",
    snap.pressure,
    "queued", snap.queued,
    "running", snap.running,
    "oldest_ms", snap.oldestQueuedMs,
    "children", snap.childCrawls,
    "stale", snap.staleRunning,
    "pruned", snap.pruned,
    "stolen", snap.stolen,
  );
}
