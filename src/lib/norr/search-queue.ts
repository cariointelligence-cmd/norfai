/**
 * Global B2B search lane.
 * One live search at a time. Finish in-flight work, then pick the next
 * queued run by plan: admin → unlimited → pro → starter → free (FIFO inside a lane).
 */
import type { Sql } from "@/lib/db";
import { normalizePlanId, type PlanId } from "./platform.ts";

export type SearchLane = "admin" | "unlimited" | "pro" | "starter" | "free";

export type FocusSearch = {
  runId: string;
  userId: string;
  plan: PlanId;
  lane: SearchLane;
  rank: number;
  status: string;
  runningJobs: number;
};

export function searchLane(opts: { isAdmin: boolean; plan: string | null | undefined }): SearchLane {
  if (opts.isAdmin) return "admin";
  const plan = normalizePlanId(opts.plan);
  if (plan === "unlimited") return "unlimited";
  if (plan === "pro") return "pro";
  if (plan === "starter") return "starter";
  return "free";
}

export function searchLaneRank(lane: SearchLane): number {
  if (lane === "admin") return 0;
  if (lane === "unlimited") return 1;
  if (lane === "pro") return 2;
  if (lane === "starter") return 3;
  return 4;
}

export function compareSearchLanes(a: { rank: number; createdAt: number }, b: { rank: number; createdAt: number }): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.createdAt - b.createdAt;
}

/** Paid lanes get more simultaneous slots. Aging stops free from starving. */
export function laneSlots(lane: SearchLane): number {
  if (lane === "admin") return 2;
  if (lane === "unlimited") return 2;
  return 1;
}

export const GLOBAL_SEARCH_SLOTS = 5;

export function agedRank(rank: number, waitedMs: number): number {
  if (waitedMs >= 180_000) return Math.max(0, rank - 2);
  if (waitedMs >= 90_000) return Math.max(0, rank - 1);
  return rank;
}

type LiveRow = {
  id: string;
  user_id: string;
  status: string;
  created_at: string | Date;
  plan: string | null;
  is_admin: boolean;
  running_jobs: number;
  live_jobs: number;
};

export async function pickFocusSearch(sql: Sql): Promise<FocusSearch | null> {
  let rows: LiveRow[] = [];
  try {
    rows = await sql<LiveRow>`
      select r.id, r.user_id, r.status, r.created_at,
        coalesce(w.plan, 'free') as plan,
        exists(select 1 from platform_admins a where a.user_id = r.user_id) as is_admin,
        (select count(*)::int from jobs j where j.run_id = r.id and j.user_id = r.user_id and j.status = 'running') as running_jobs,
        (select count(*)::int from jobs j where j.run_id = r.id and j.user_id = r.user_id and j.status in ('queued','running')) as live_jobs
      from search_runs r
      left join workspaces w on w.user_id = r.user_id
      where r.status in ('queued','running')
      order by r.created_at asc
      limit 80`;
  } catch {
    try {
      rows = await sql<LiveRow>`
        select r.id, r.user_id, r.status, r.created_at,
          'free'::text as plan, false as is_admin,
          (select count(*)::int from jobs j where j.run_id = r.id and j.status = 'running') as running_jobs,
          (select count(*)::int from jobs j where j.run_id = r.id and j.status in ('queued','running')) as live_jobs
        from search_runs r
        where r.status in ('queued','running')
        order by r.created_at asc
        limit 80`;
    } catch {
      return null;
    }
  }
  const live = rows.filter((r) => Number(r.live_jobs ?? 0) > 0);
  if (!live.length) return null;
  const now = Date.now();
  const ranked = live.map((r) => {
    const lane = searchLane({ isAdmin: Boolean(r.is_admin), plan: r.plan });
    const createdAt = r.created_at instanceof Date ? r.created_at.getTime() : Date.parse(String(r.created_at)) || 0;
    const waited = Math.max(0, now - createdAt);
    const inflight = Number(r.running_jobs ?? 0) > 0 ? 0 : 1;
    return { row: r, lane, rank: agedRank(searchLaneRank(lane), waited) + inflight * 0.01, createdAt };
  });
  ranked.sort((a, b) => compareSearchLanes(a, b));
  const hit = ranked[0];
  if (!hit) return null;
  return {
    runId: hit.row.id,
    userId: hit.row.user_id,
    plan: normalizePlanId(hit.row.plan),
    lane: hit.lane,
    rank: hit.rank,
    status: hit.row.status,
    runningJobs: Number(hit.row.running_jobs ?? 0),
  };
}

export async function pickFocusSearches(sql: Sql, limit = GLOBAL_SEARCH_SLOTS): Promise<FocusSearch[]> {
  const first = await pickFocusSearch(sql);
  if (!first) return [];
  return [first].slice(0, Math.max(1, Math.min(limit, GLOBAL_SEARCH_SLOTS)));
}

export async function searchQueueView(sql: Sql, userId: string, runId: string): Promise<{
  focus: FocusSearch | null;
  active: boolean;
  position: number;
  ahead: number;
  lane: SearchLane | null;
}> {
  const focus = await pickFocusSearch(sql);
  if (!focus) return { focus: null, active: false, position: 0, ahead: 0, lane: null };
  if (focus.runId === runId && focus.userId === userId) {
    return { focus, active: true, position: 1, ahead: 0, lane: focus.lane };
  }
  let ahead = 0;
  let lane: SearchLane | null = null;
  try {
    const rows = await sql<{ id: string; user_id: string; plan: string | null; is_admin: boolean; created_at: string | Date }>`
      select r.id, r.user_id, r.created_at, coalesce(w.plan, 'free') as plan,
        exists(select 1 from platform_admins a where a.user_id = r.user_id) as is_admin
      from search_runs r
      left join workspaces w on w.user_id = r.user_id
      where r.status in ('queued','running')
        and exists (select 1 from jobs j where j.run_id = r.id and j.user_id = r.user_id and j.status in ('queued','running'))`;
    const ranked = rows.map((r) => {
      const ln = searchLane({ isAdmin: Boolean(r.is_admin), plan: r.plan });
      const createdAt = r.created_at instanceof Date ? r.created_at.getTime() : Date.parse(String(r.created_at)) || 0;
      const waited = Math.max(0, Date.now() - createdAt);
      return { id: r.id, userId: r.user_id, lane: ln, rank: agedRank(searchLaneRank(ln), waited), createdAt };
    }).sort((a, b) => compareSearchLanes(a, b));
    const idx = ranked.findIndex((r) => r.id === runId && r.userId === userId);
    if (idx >= 0) {
      ahead = idx;
      lane = ranked[idx]?.lane ?? null;
    }
  } catch {
    ahead = focus.runId === runId ? 0 : 1;
  }
  return { focus, active: false, position: ahead + 1, ahead, lane };
}
