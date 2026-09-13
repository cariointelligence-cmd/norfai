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
  const maxMs = vercelFunctionBudgetMs();
  let processed = 0;
  if (opts.userId) {
    processed = await processJobsFor(sql, opts.userId, opts.runId ?? null, {
      maxMs,
      concurrency: RUNTIME.workerJobConcurrency,
    });
    try { await processDueSchedules(sql, opts.userId); } catch { /* schedules optional */ }
  } else {
    const users = await sql<{ user_id: string }>`
      select distinct user_id from jobs
      where status in ('queued','running') and run_after <= now()
      limit ${RUNTIME.workerUserLimit}`;
    for (const u of users) {
      processed += await processJobsFor(sql, u.user_id, null, {
        maxMs: Math.min(8_000, maxMs),
        concurrency: RUNTIME.workerJobConcurrency,
      });
      try { await processDueSchedules(sql, u.user_id); } catch { /* */ }
    }
  }
  const remaining = await countDueJobs(opts.userId, opts.runId);
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
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);
    try {
      const res = await fetch(`${origin}${DRAIN_PATH}`, { method: "POST", headers, body, signal: ac.signal });
      if (!res.ok) {
        console.warn("[norf] vercel drain http", res.status);
        return { ok: false, mode: "http" };
      }
    } catch (err) {
      console.warn("[norf] vercel drain invoke", err instanceof Error ? err.message : err);
      return { ok: false, mode: "http" };
    } finally {
      clearTimeout(t);
    }
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
export function dispatchVercelExecution(opts: DrainRequest): void {
  scheduleBackground(() => runVercelDrain({ ...opts, depth: opts.depth ?? 0, reason: opts.reason ?? "dispatch" }));
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
