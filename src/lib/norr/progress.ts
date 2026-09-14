export function displayRunStatus(status: string, jobsLive: boolean): string {
  if (status === "cancelled" || status === "failed" || status === "paused") return status;
  if (jobsLive) return "running";
  return status;
}
export type JobCountRow = { type?: string | null; status?: string | null; n?: number | null };
type JobLite = { type?: string | null; status?: string | null };

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
  const coreOpen = rows.some((row) => {
    const t = row.type || "";
    const st = String(row.status ?? "");
    return (t === "discover" || t === "enrich" || t === "email") && st !== "done" && st !== "failed" && st !== "cancelled";
  });
  const use = coreOpen
    ? rows.filter((row) => {
        const t = row.type || "score";
        return t === "discover" || t === "enrich" || t === "email" || t === "scrape";
      })
    : rows;
  let total = 0;
  let done = 0;
  let inflight = 0;
  let earned = 0;
  let weight = 0;
  const remaining = new Map<string, number>();
  let discoverLive = false;
  for (const row of use) {
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
  const pct = running && discoverLive ? Math.max(inflight ? 45 : 20, pctRaw) : waiting ? 4 : pctRaw;
  return {
    pct: Math.min(99, pct),
    stage,
    label: running && discoverLive ? "Registers" : waiting ? "Waiting to start" : (labels[stage] ?? "Working"),
    done,
    total,
    running,
  };
}

export function runProgress(
  jobs: JobLite[] | null | undefined,
  runStatus: string,
  hint?: { matched?: number; want?: number },
): ReturnType<typeof runProgressFromCounts> {
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
  const base = runProgressFromCounts(counts, runStatus);
  const matched = Math.max(0, Number(hint?.matched ?? 0));
  if (matched > 0 && base.running && (base.stage === "discover" || base.done === 0)) {
    const want = Math.max(Number(hint?.want ?? 0), matched);
    const fill = Math.min(90, Math.round(18 + (72 * matched) / Math.max(want, 1)));
    return {
      ...base,
      stage: "enrich",
      label: want > matched ? `Found ${matched} of ${want}` : `Found ${matched}`,
      pct: Math.max(base.pct, fill),
      done: Math.max(base.done, matched),
      total: Math.max(base.total, want),
    };
  }
  return base;
}

export type WorkLane = { key: string; label: string; pct: number; hint: string; running: boolean };

export function workLanes(
  jobs: JobLite[] | null | undefined,
  runStatus: string,
  hint?: { matched?: number; want?: number; foundEmail?: number; missingEmail?: number; foundDecisionMaker?: number; missingDecisionMaker?: number },
): WorkLane[] {
  const list = jobs ?? [];
  const live = runStatus === "running" || runStatus === "queued";
  const doneish = (st: string) => st === "done" || st === "failed" || st === "cancelled";
  const lane = (key: string, label: string, types: string[], fallbackPct: number, hintText: string): WorkLane => {
    const rows = list.filter((j) => types.includes(j.type || ""));
    const total = rows.length;
    const done = rows.filter((j) => doneish(j.status || "")).length;
    const running = live && rows.some((j) => j.status === "queued" || j.status === "running");
    const pct = !live && (runStatus === "completed" || runStatus === "cancelled")
      ? 100
      : total
        ? Math.min(running ? 99 : 100, Math.round((100 * done) / total))
        : live ? fallbackPct : runStatus === "completed" ? 100 : 0;
    return { key, label, pct, hint: hintText, running };
  };
  const matched = Math.max(0, Number(hint?.matched ?? 0));
  const want = Math.max(Number(hint?.want ?? 0), matched, 1);
  const emails = Math.max(0, Number(hint?.foundEmail ?? 0));
  const missingE = Math.max(0, Number(hint?.missingEmail ?? 0));
  const dm = Math.max(0, Number(hint?.foundDecisionMaker ?? 0));
  const missingDm = Math.max(0, Number(hint?.missingDecisionMaker ?? 0));
  const discPct = live
    ? Math.min(99, Math.round((100 * matched) / want))
    : matched ? 100 : 0;
  const companies: WorkLane = {
    key: "discover",
    label: "Companies",
    pct: discPct,
    hint: matched ? `${matched} matched` : "Register search",
    running: live && matched < want,
  };
  return [
    companies,
    lane("enrich", "Enrichment", ["enrich", "scrape", "crawl"], live && matched ? 18 : 0, "Websites and public pages"),
    lane("email", "Emails", ["email"], emails + missingE ? Math.round((100 * emails) / Math.max(emails + missingE, 1)) : 0, `${emails} found · ${missingE} missing`),
    lane("people", "Decision-makers", ["email", "enrich"], dm + missingDm ? Math.round((100 * dm) / Math.max(dm + missingDm, 1)) : 0, `${dm} found · ${missingDm} missing`),
  ];
}

