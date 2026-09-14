export function displayRunStatus(status: string, jobsLive: boolean): string {
  if (status === "cancelled" || status === "failed" || status === "paused") return status;
  if (jobsLive) return "running";
  return status;
}
export type JobCountRow = { type?: string | null; status?: string | null; n?: number | null };

const STAGE_WEIGHT: Record<string, number> = {
  discover: 16,
  enrich: 26,
  scrape: 18,
  crawl: 10,
  signals: 6,
  score: 14,
};

const TERMINAL = new Set(["done", "failed", "cancelled"]);

export function runProgressFromCounts(
  counts: JobCountRow[] | null | undefined,
  runStatus: string,
): {
  pct: number;
  stage: string;
  label: string;
  done: number;
  total: number;
  running: boolean;
} {
  const running = runStatus === "running" || runStatus === "queued";
  const rows = counts ?? [];
  let total = 0;
  let done = 0;
  let inflight = 0;
  let earned = 0;
  let weight = 0;
  const remaining = new Map<string, number>();
  let discoverLive = false;
  for (const row of rows) {
    const n = Math.max(0, Number(row.n ?? 0));
    if (!n) continue;
    const t = row.type || "score";
    const st = String(row.status ?? "");
    const w = STAGE_WEIGHT[t] ?? 10;
    total += n;
    weight += w * n;
    if (st === "done" || st === "cancelled") {
      earned += w * n;
      done += n;
    } else if (st === "failed") {
      earned += w * 0.2 * n;
      done += n;
    } else {
      const scanning = st === "running";
      earned += scanning ? w * 0.45 * n : 0;
      if (st === "running") inflight += n;
      remaining.set(t, (remaining.get(t) ?? 0) + n);
      if (t === "discover" && (st === "queued" || st === "running")) discoverLive = true;
    }
  }
  if (runStatus === "completed" || runStatus === "cancelled") {
    return { pct: 100, stage: "done", label: runStatus === "cancelled" ? "Cancelled" : "Complete", done, total, running: false };
  }
  if (runStatus === "failed") {
    return { pct: Math.max(8, total ? Math.round((100 * done) / total) : 8), stage: "failed", label: "Stopped", done, total, running: false };
  }
  if (!total) {
    const pct = runStatus === "queued" ? 4 : 8;
    return { pct, stage: "discover", label: "Opening registers", done: 0, total: 0, running };
  }
  const order = ["discover", "enrich", "scrape", "score", "crawl", "signals"] as const;
  const stage = order.find((s) => (remaining.get(s) ?? 0) > 0) ?? (inflight ? "enrich" : "score");
  const labels: Record<string, string> = {
    discover: inflight ? "Registers" : "Waiting to start",
    enrich: "Enriching companies",
    scrape: "Web search",
    crawl: "Reading websites",
    signals: "Signals",
    score: "Scoring",
  };
  const waiting = discoverLive && inflight === 0 && done === 0 && runStatus === "queued";
  const pctRaw = Math.max(2, Math.min(99, weight ? Math.round((100 * earned) / weight) : Math.round((100 * done) / total)));
  const pct = running && discoverLive ? Math.max(12, pctRaw) : waiting ? 4 : pctRaw;
  return {
    pct,
    stage,
    label: running && discoverLive ? "Registers" : waiting ? "Waiting to start" : (labels[stage] ?? "Working"),
    done,
    total,
    running,
  };
}

export function runProgress(jobs: JobLite[] | null | undefined, runStatus: string): ReturnType<typeof runProgressFromCounts> {
  const map = new Map<string, number>();
  for (const j of jobs ?? []) {
    const k = `${j.type || "score"}\t${j.status || ""}`;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const counts: JobCountRow[] = [];
  for (const [k, n] of map) {
    const [type, status] = k.split("\t");
    counts.push({ type, status, n });
  }
  return runProgressFromCounts(counts, runStatus);
}

void TERMINAL;
