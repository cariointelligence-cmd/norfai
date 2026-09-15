/**
 * All Norfai background execution runs on Vercel functions.
 * Durable state = Postgres jobs. Execution = this drain + self-chain + cron recovery.
 * No external worker process. setInterval is not the production path.
 */
import { RUNTIME } from "./runtime.ts";
import { scheduleBackground } from "./hybrid.ts";
import { signServiceRequest, internalSecret } from "./internal-auth.ts";

export const DRAIN_MAX_DEPTH = 24;
export const DRAIN_PATH = "/api/jobs/drain";

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL);
}

export function vercelFunctionBudgetMs(): number {
  const env = Number(process.env.VERCEL_FUNCTION_MAX_MS);
  if (Number.isFinite(env) && env >= 3_000) return Math.min(50_000, Math.round(env) - 2_000);
  if (isVercelRuntime()) return 18_000;
  return RUNTIME.workerMaxMs;
}

export function vercelSelfOrigin(): string | null {
  const auth = process.env.BETTER_AUTH_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim();
  if (auth) return auth.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod && !prod.includes(".vercel.app")) return prod.startsWith("http") ? prod : `https://${prod}`;
  return "https://www.norfai.com";
}

export type DrainRequest = {
  userId?: string | null;
  runId?: string | null;
  depth?: number;
  reason?: string;
};

export type DrainResult = {
  processed: number;
  remaining: number;
  depth: number;
  chained: boolean;
  plane: "vercel";
  reason: string;
};

export async function countDueJobs(userId?: string | null, runId?: string | null): Promise<number> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  if (userId && runId) {
    const [r] = await sql`select count(*)::int as n from jobs
      where user_id = ${userId} and run_id = ${runId} and status in ('queued','running') and run_after <= now()`;
    return Number(r?.n ?? 0);
  }
  if (userId) {
    const [r] = await sql`select count(*)::int as n from jobs
      where user_id = ${userId} and status in ('queued','running') and run_after <= now()`;
    return Number(r?.n ?? 0);
  }
  const [r] = await sql`select count(*)::int as n from jobs
    where status in ('queued','running') and run_after <= now()`;
  return Number(r?.n ?? 0);
}

export async function drainBatch(opts: DrainRequest): Promise<{ processed: number; remaining: number }> {
  const { getSql } = await import("@/lib/db");
  const { processJobsFor, processDueSchedules } = await import("./pipeline.ts");
  const sql = await getSql();
  try {
    const { sweepDeadQueue, applyQueueImmune, snapshotQueueDepth } = await import("./queue-monitor.ts");
    await sweepDeadQueue(sql);
    const snap = await snapshotQueueDepth(sql);
    await applyQueueImmune(sql, snap);
  } catch { /* */ }
  try {
    await sql`update jobs set status = ${"cancelled"}, locked_at = null, last_error = ${"run closed"}, updated_at = now()
      where status in ('queued','running')
        and (
          run_id is null
          or run_id in (select id from search_runs where status in ('completed','cancelled','failed'))
          or not exists (select 1 from search_runs r where r.id = jobs.run_id)
        )`;
  } catch { /* */ }
  const maxMs = 22_000;
  let processed = 0;
  const focus = opts.runId
    ? { userId: opts.userId ?? null, runId: opts.runId }
    : await pickFocusSearch(sql);
  const targetUser = focus?.userId ?? opts.userId ?? null;
  const targetRun = focus?.runId ?? opts.runId ?? null;
  if (targetUser && targetRun) {
    processed = await processJobsFor(sql, targetUser, targetRun, {
      maxMs,
      concurrency: 24,
      skipSchema: true,
    });
    if (opts.userId && opts.userId === targetUser) {
      try { await processDueSchedules(sql, opts.userId); } catch { /* */ }
    }
  } else if (opts.userId) {
    try { await processDueSchedules(sql, opts.userId); } catch { /* */ }
  }
  const remaining = await countDueJobs(targetUser, targetRun);
  if (remaining > 80) {
    scheduleBackground(() => invokeVercelDrain({
      userId: targetUser,
      runId: targetRun,
      depth: (opts.depth ?? 0) + 1,
      reason: `${opts.reason ?? "drain"}.fanout`,
    }));
  }
  try {
    const { maybeAutoPublishBlogs } = await import("./platform.ts");
    await maybeAutoPublishBlogs(sql);
  } catch { /* daily SEO posts */ }
  try {
    const { processMailOutbox } = await import("./mailer.ts");
    await processMailOutbox(sql, 8);
  } catch { /* mail flush is best-effort */ }
  return { processed, remaining };
}

export function shouldChain(remaining: number, depth: number): boolean {
  return remaining > 0 && depth < DRAIN_MAX_DEPTH;
}

export async function invokeVercelDrain(opts: DrainRequest): Promise<{ ok: boolean; mode: "http" | "in-process" | "skipped" }> {
  const depth = opts.depth ?? 0;
  if (depth >= DRAIN_MAX_DEPTH) return { ok: false, mode: "skipped" };
  const origin = vercelSelfOrigin();
  const secret = internalSecret();
  if (origin && secret) {
    const body = JSON.stringify({
      userId: opts.userId ?? null,
      runId: opts.runId ?? null,
      depth,
      reason: opts.reason ?? "chain",
    });
    const signed = signServiceRequest({ service: "worker", scope: "jobs.drain", body });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: signed.authorization,
      "x-norf-timestamp": signed.timestamp,
      "x-norf-nonce": signed.nonce,
      "x-norf-request-id": signed.requestId,
      "x-norf-scope": signed.scope,
    };
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
    if (bypass) headers["x-vercel-protection-bypass"] = bypass;
    const p = fetch(`${origin}${DRAIN_PATH}`, { method: "POST", headers, body });
    p.then((res) => res.arrayBuffer()).catch((err) => {
      console.warn("[norf] vercel drain invoke", err instanceof Error ? err.message : err);
    });
    scheduleBackground(() => p);
    return { ok: true, mode: "http" };
  }
  scheduleBackground(() => runVercelDrain({ ...opts, depth }));
  return { ok: true, mode: "in-process" };
}

export async function runVercelDrain(opts: DrainRequest): Promise<DrainResult> {
  const depth = opts.depth ?? 0;
  const reason = opts.reason ?? "drain";
  const { processed, remaining } = await drainBatch(opts);
  const chained = shouldChain(remaining, depth + 1);
  if (chained) {
    scheduleBackground(() => invokeVercelDrain({ ...opts, depth: depth + 1, reason: `${reason}.chain` }));
  }
  return { processed, remaining, depth, chained, plane: "vercel", reason };
}

/** Fire-and-forget. In-process drain on waitUntil is the Nerve; HTTP is the chain. */
export function dispatchVercelExecution(opts: DrainRequest, flags?: { http?: boolean }): void {
  scheduleBackground(() => runVercelDrain({ ...opts, depth: opts.depth ?? 0, reason: opts.reason ?? "dispatch" }));
  if (flags?.http === false) return;
  void kickSiblingDrain(opts, 0);
}

/** Start a sibling drain lambda without holding the user request. */
export async function kickSiblingDrain(opts: DrainRequest, waitMs = 80): Promise<void> {
  const origin = vercelSelfOrigin();
  const secret = internalSecret();
  if (!origin || !secret) return;
  const body = JSON.stringify({
    userId: opts.userId ?? null,
    runId: opts.runId ?? null,
    depth: opts.depth ?? 0,
    reason: opts.reason ?? "kick",
  });
  const signed = signServiceRequest({ service: "worker", scope: "jobs.drain", body });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: signed.authorization,
    "x-norf-timestamp": signed.timestamp,
    "x-norf-nonce": signed.nonce,
    "x-norf-request-id": signed.requestId,
    "x-norf-scope": signed.scope,
  };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const p = fetch(`${origin}${DRAIN_PATH}`, { method: "POST", headers, body }).then((r) => r.arrayBuffer()).catch(() => undefined);
  await Promise.race([p, new Promise<void>((r) => setTimeout(r, waitMs))]);
}

export function executionPlane() {
  return {
    plane: "vercel" as const,
    legacyBackend: "retired" as const,
    intervalWorker: isVercelRuntime() ? "disabled" : "local-dev-shim",
    selfDrain: true,
    cronRecovery: "*/2",
    origin: vercelSelfOrigin(),
    budgetMs: vercelFunctionBudgetMs(),
  };
}
