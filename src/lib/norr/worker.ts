import { getSql } from "@/lib/db";
import { processDueSchedules, processJobsFor } from "./pipeline.ts";
import { maybeAutoPublishBlogs } from "./platform.ts";
import { buildWeeklyDigest } from "./ops-store.ts";
import { ensureOpsSchema } from "./tenant.ts";
import { poolMap } from "./engines.ts";
import { RUNTIME } from "./runtime.ts";
import { isVercelRuntime, dispatchVercelExecution, countDueJobs } from "./vercel-executor.ts";
import {
  snapshotQueueDepth,
  applyQueueImmune,
  logQueueSnapshot,
  persistQueueSnapshot,
  type QueueSnapshot,
} from "./queue-monitor.ts";

const globalRef = globalThis as typeof globalThis & {
  __norfWorker__?: { timer: ReturnType<typeof setInterval> | null; inflight: boolean };
};

function slot() {
  globalRef.__norfWorker__ ??= { timer: null, inflight: false };
  return globalRef.__norfWorker__;
}

async function maybeWeeklyDigests(sql: Awaited<ReturnType<typeof getSql>>): Promise<void> {
  const hour = new Date().getUTCHours();
  if (hour !== 6) return;
  try {
    await ensureOpsSchema(sql);
    const recent = await sql<{ user_id: string }>`select user_id from digests where created_at > now() - interval '20 hours'`;
    const done = new Set(recent.map((r) => r.user_id));
    const users = await sql<{ user_id: string }>`select distinct user_id from companies where deleted_at is null limit 50`;
    for (const u of users) {
      if (done.has(u.user_id)) continue;
      try {
        await buildWeeklyDigest(sql, u.user_id);
      } catch (err) {
        console.error("[norf] digest", u.user_id, err);
      }
    }
  } catch (err) {
    console.error("[norf] digest tick", err);
  }
}

export async function runWorkerTick(): Promise<{ users: number; queue?: QueueSnapshot }> {
  const sql = await getSql();
  let queue: QueueSnapshot | undefined;
  try {
    queue = await snapshotQueueDepth(sql);
    const act = await applyQueueImmune(sql, queue);
    queue = { ...queue, pruned: act.pruned, stolen: act.stolen };
    logQueueSnapshot(queue);
    await persistQueueSnapshot(sql, queue);
  } catch (err) {
    console.error("[norf-worker] queue snapshot", err);
  }
  const jobUsers = await sql<{ user_id: string }>`
    select distinct user_id from jobs
    where status in ('queued','running') and run_after <= now()
    limit ${RUNTIME.workerUserLimit}`;
  let schedUsers: Array<{ user_id: string }> = [];
  try {
    schedUsers = await sql<{ user_id: string }>`
      select distinct user_id from search_profiles
      where schedule_enabled = true and next_run_at is not null and next_run_at <= now()
      limit ${RUNTIME.workerUserLimit}`;
  } catch {
    schedUsers = [];
  }
  const seen = new Set<string>();
  const users: string[] = [];
  for (const row of [...jobUsers, ...schedUsers]) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    users.push(row.user_id);
  }
  await poolMap(users, RUNTIME.workerUserConcurrency, async (userId) => {
    await processJobsFor(sql, userId, null, { maxMs: 8_000, concurrency: 2, skipSchema: true });
    await processDueSchedules(sql, userId);
  });
  const hour = new Date().getUTCHours();
  if (hour >= 5 && hour <= 20) {
    await maybeAutoPublishBlogs(sql);
  }
  if (hour === 6) {
    try {
      const { snapshotSeo } = await import("@/lib/seo/store.ts");
      await snapshotSeo(sql);
    } catch (err) {
      console.error("[norf] seo snapshot", err);
    }
    await maybeWeeklyDigests(sql);
  }
  try {
    const { runMailTick } = await import("./mail-automations.ts");
    await runMailTick(sql);
  } catch (err) {
    console.error("[norf] mail tick", err);
  }
  try {
    const remaining = await countDueJobs();
    if (remaining > 0) dispatchVercelExecution({ reason: "cron.continue" });
  } catch { /* chain optional */ }
  return { users: users.length, queue };
}

async function tickWorker() {
  const s = slot();
  if (s.inflight) return;
  s.inflight = true;
  try {
    await runWorkerTick();
  } catch (err) {
    console.error("[norf-worker]", err);
  } finally {
    s.inflight = false;
  }
}

/**
 * Local-dev only. Production Vercel never uses setInterval — functions die
 * when the request ends. Jobs run via /api/jobs/drain self-chain + cron.
 */
export function ensureWorker() {
  if (typeof window !== "undefined") return;
  void import("./engines.ts").then((m) => m.bootExtractDaemon()).catch(() => undefined);
  if (isVercelRuntime()) return;
  const s = slot();
  if (s.timer) return;
  s.timer = setInterval(() => {
    void tickWorker();
  }, 2000);
  void tickWorker();
}

export async function triggerWorkerTick(): Promise<{ ran: boolean; users?: number; queue?: QueueSnapshot }> {
  if (typeof window !== "undefined") return { ran: false };
  const s = slot();
  if (s.inflight) return { ran: false };
  s.inflight = true;
  try {
    const r = await runWorkerTick();
    return { ran: true, users: r.users, queue: r.queue };
  } catch (err) {
    console.error("[norf-worker]", err);
    return { ran: false };
  } finally {
    s.inflight = false;
  }
}
