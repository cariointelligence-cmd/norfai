import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminDrainQueue, getSearchHealth } from "@/lib/norr/actions";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/status";
import { formatQueueAge, queuePressureTone, type QueuePressure } from "@/lib/norr/queue-monitor";

export const Route = createFileRoute("/admin/search")({ component: AdminSearchHealth });

function pct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 1000) / 10}%`;
}

type QueueType = { type: string; queued: number; running: number };
type QueueView = {
  queued?: number;
  running?: number;
  depth?: number;
  oldestQueuedMs?: number | null;
  childCrawls?: number;
  staleRunning?: number;
  users?: number;
  runs?: number;
  pressure?: QueuePressure;
  label?: string;
  byType?: QueueType[];
  pruned?: number;
  stolen?: number;
};
type HistoryRow = {
  taken_at: string | Date;
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
};

function AdminSearchHealth() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["search-health"], queryFn: () => getSearchHealth(), refetchInterval: 8_000 });
  const drain = useMutation({
    mutationFn: () => adminDrainQueue(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["search-health"] }),
  });
  const payload = q.data as {
    ok?: boolean;
    error?: string;
    production?: {
      searchWorking?: boolean;
      databaseReachable?: boolean;
      aiConfigured?: boolean;
      sources?: Array<{ id: string; status: string }>;
    } | null;
    queue?: QueueView;
    queueHistory?: HistoryRow[];
    queueDepth?: number;
    searchesToday?: number;
    successful?: number;
    failed?: number;
    avgLatencyMs?: number;
    p95LatencyMs?: number;
    duplicateRate?: number;
    repeatedLeadRate?: number;
    csvToday?: number;
    csvTotal?: number;
    exhausted?: number;
    fabric?: {
      stall?: { code?: string; likely?: string; evidence?: string[] };
      recommendations?: Array<{ priority: string; title: string; evidence: string; impact: string }>;
      vercel?: {
        env?: string | null;
        region?: string | null;
        gitSha?: string | null;
        fastPath?: string;
        background?: string;
        plane?: string;
        legacyBackend?: string;
        selfDrain?: boolean;
        cronRecovery?: string;
      };
      cache?: { hitRate?: number; hits?: number; misses?: number; size?: number };
    };
    recent?: Array<{
      id: string;
      run_id: string | null;
      duration_ms: number | null;
      candidate_count: number | null;
      final_count: number | null;
      new_leads_count: number | null;
      previously_seen_count: number | null;
      duplicate_ratio: number | null;
      novelty_avg: number | null;
      exhausted: boolean;
      status: string | null;
      created_at: string;
      ranking_version: string | null;
      query_fingerprint: string | null;
    }>;
  } | undefined;
  const d = payload && payload.ok ? payload : null;
  const denied = payload && !payload.ok;
  const queue = (d?.queue ?? {}) as QueueView;
  const history = (d?.queueHistory ?? []) as HistoryRow[];
  const pressure = (queue.pressure ?? "idle") as QueuePressure;
  const recent = d?.recent ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Search health</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Worker queue, source path, latency and leftover jobs. Drain closes stale searches that no longer have discover/enrich work.
          </p>
        </div>
        <Button variant="secondary" disabled={drain.isPending} onClick={() => drain.mutate()}>
          {drain.isPending ? "Draining…" : "Drain stuck jobs"}
        </Button>
      </div>
      {denied ? <p className="text-sm text-bad">{payload && payload.error ? payload.error : "Admin only"}</p> : null}
      <section className="border border-line bg-panel p-4 space-y-2">
        <h2 className="text-sm font-medium">System health</h2>
        <ul className="grid gap-1 text-sm text-mute sm:grid-cols-2">
          <li>Queue {queue.label ?? pressure} · {queue.depth ?? 0} live · oldest {formatQueueAge(queue.oldestQueuedMs ?? null)}</li>
          <li>Workspaces with jobs {queue.users ?? 0} · live searches {queue.runs ?? 0}</li>
          <li>Searches today {d?.searchesToday ?? 0} · successful {d?.successful ?? 0} · failed {d?.failed ?? 0}</li>
          <li>Start latency avg {d?.avgLatencyMs ?? 0} ms · p95 {d?.p95LatencyMs ?? 0} ms</li>
          <li>Duplicate rate {pct(d?.duplicateRate ?? 0)} · repeated leads {pct(d?.repeatedLeadRate ?? 0)}</li>
          <li>CSV today {d?.csvToday ?? 0} · exhausted pools {d?.exhausted ?? 0}</li>
        </ul>
      </section>
      {d?.fabric ? (
        <section className="border border-line bg-panel p-4 space-y-2">
          <h2 className="text-sm font-medium">Execution fabric</h2>
          <p className="text-sm text-mute">
            Stall: {d.fabric.stall?.code ?? "n/a"} — {d.fabric.stall?.likely ?? "no correlated signal"}
          </p>
          {d.fabric.vercel ? (
            <p className="text-xs text-mute">
              Plane {d.fabric.vercel.plane ?? "vercel"} · legacy {d.fabric.vercel.legacyBackend ?? "retired"} · {d.fabric.vercel.env ?? "local"} · {d.fabric.vercel.region ?? "n/a"} · {d.fabric.vercel.background}
              {d.fabric.vercel.gitSha ? ` · ${d.fabric.vercel.gitSha.slice(0, 8)}` : ""}
            </p>
          ) : null}
          {d.fabric.cache ? (
            <p className="text-xs text-mute">
              Cache hit {(Number(d.fabric.cache.hitRate ?? 0) * 100).toFixed(0)}% · {d.fabric.cache.size ?? 0} entries
            </p>
          ) : null}
          {(d.fabric.recommendations ?? []).length ? (
            <ul className="space-y-1 text-sm text-mute">
              {d.fabric.recommendations!.map((r) => (
                <li key={r.title}><span className="text-ink">{r.priority}</span> {r.title} · {r.evidence}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">No capacity recommendations. Queue and P95 are inside the healthy band.</p>
          )}
        </section>
      ) : null}
      {d?.production ? (
        <section className="border border-line bg-panel p-4 space-y-2">
          <h2 className="text-sm font-medium">Production path</h2>
          <p className="text-sm text-mute">
            Search {d.production.searchWorking ? "working" : "not confirmed"}.
            Database {d.production.databaseReachable ? "reachable" : "not reachable"}.
            AI {d.production.aiConfigured ? "configured" : "not configured"}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(d.production.sources ?? []).slice(0, 16).map((s) => (
              <Pill key={s.id} tone={s.status === "ACTIVE" ? "good" : s.status === "RETIRED" ? "mute" : "warn"}>{s.id} {s.status}</Pill>
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Worker queue</h2>
          <Pill tone={queuePressureTone(pressure)}>{queue.label ?? pressure}</Pill>
        </div>
        <p className="mb-3 max-w-2xl text-xs text-mute">
          Live jobs across every workspace. Leftover child crawl jobs are retired on the next worker tick. Stale running locks are stolen after 30 seconds.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card label="Queue depth" value={queue.depth ?? d?.queueDepth ?? 0} />
          <Card label="Queued" value={queue.queued ?? 0} />
          <Card label="Running" value={queue.running ?? 0} />
          <Card label="Oldest live" value={formatQueueAge(queue.oldestQueuedMs ?? null)} />
          <Card label="Leftover page jobs" value={queue.childCrawls ?? 0} />
          <Card label="Stale locks" value={queue.staleRunning ?? 0} />
          <Card label="Workspaces" value={queue.users ?? 0} />
          <Card label="Live searches" value={queue.runs ?? 0} />
        </div>
        {(queue.byType ?? []).length ? (
          <div className="mt-3 overflow-x-auto border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
                <tr>
                  {["Type", "Queued", "Running", "Live"].map((h) => (
                    <th key={h} className="border-b border-line px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(queue.byType ?? []).map((row) => (
                  <tr key={row.type} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-mono text-xs">{row.type}</td>
                    <td className="px-3 py-2 font-mono tabular">{row.queued}</td>
                    <td className="px-3 py-2 font-mono tabular">{row.running}</td>
                    <td className="px-3 py-2 font-mono tabular">{row.queued + row.running}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-mute">No live jobs.</p>
        )}
        {history.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-faint">Recent snapshots</h3>
            <div className="max-h-56 overflow-auto border border-line text-xs">
              {history.map((row, i) => (
                <div key={`${String(row.taken_at)}-${i}`} className="flex flex-wrap justify-between gap-2 border-b border-line px-3 py-1.5 last:border-0">
                  <span className="text-mute">{new Date(row.taken_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span className="font-mono tabular">{row.depth} live · {row.queued} queued · {row.running} running</span>
                  <span className="text-mute">{row.pressure}{row.pruned ? ` · retired ${row.pruned}` : ""}{row.stolen ? ` · stolen ${row.stolen}` : ""}{row.oldest_queued_ms ? ` · oldest ${formatQueueAge(row.oldest_queued_ms)}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Searches today" value={d?.searchesToday ?? 0} />
        <Card label="Successful" value={d?.successful ?? 0} />
        <Card label="Failed" value={d?.failed ?? 0} />
        <Card label="Average latency" value={`${d?.avgLatencyMs ?? 0} ms`} />
        <Card label="P95 latency" value={`${d?.p95LatencyMs ?? 0} ms`} />
        <Card label="Duplicate rate" value={pct(d?.duplicateRate ?? 0)} />
        <Card label="Repeated lead rate" value={pct(d?.repeatedLeadRate ?? 0)} />
        <Card label="CSV today" value={d?.csvToday ?? 0} />
        <Card label="CSV total" value={d?.csvTotal ?? 0} />
        <Card label="Exhausted pools" value={d?.exhausted ?? 0} />
      </div>
      <section>
        <h2 className="mb-2 text-sm font-medium">Recent searches</h2>
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-panel text-[11px] uppercase tracking-[0.12em] text-faint">
              <tr>
                {["When", "Status", "Ms", "Final", "New", "Seen", "Dup", "Rank"].map((h) => (
                  <th key={h} className="border-b border-line px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-mute">No search health events yet.</td></tr>
              ) : recent.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-xs text-mute">{new Date(r.created_at).toLocaleString("en-GB")}</td>
                  <td className="px-3 py-2"><Pill tone={r.status === "completed" ? "good" : r.status === "running" ? "warn" : "mute"}>{r.status ?? "n/a"}</Pill></td>
                  <td className="px-3 py-2 font-mono tabular">{r.duration_ms ?? 0}</td>
                  <td className="px-3 py-2 font-mono tabular">{r.final_count ?? 0}</td>
                  <td className="px-3 py-2 font-mono tabular">{r.new_leads_count ?? 0}</td>
                  <td className="px-3 py-2 font-mono tabular">{r.previously_seen_count ?? 0}</td>
                  <td className="px-3 py-2 font-mono tabular">{r.duplicate_ratio != null ? pct(r.duplicate_ratio) : "0%"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ranking_version ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-panel p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-faint">{label}</div>
      <div className="mt-2 text-2xl tabular">{value}</div>
    </div>
  );
}
