import { nid } from "@/lib/utils";
import type { SearchCriteria } from "./types.ts";
import { compileCriteria } from "./filter-dsl.ts";
import { compileIcp } from "./icp-compiler.ts";
import { blockingIssue } from "./query-validation.ts";
import { boundedString, queryCost } from "./security.ts";
import { queryFingerprint, RANKING_VERSION, searchLabel } from "./fingerprint.ts";
import { assertSearchQuota, assertCompanyQuota, refundSearchQuota } from "./platform.ts";
import { enqueueJob, audit } from "./repo.ts";
import { scoped } from "./tenant.ts";
import { dispatchVercelExecution } from "./vercel-executor.ts";
import { startTrace, markStage, endStage } from "./observability.ts";

export type SearchIntakeResult = {
  ok: boolean;
  runId: string;
  discovered: number;
  error?: string;
  state?: string;
  reused?: boolean;
  createdMs?: number;
};

export async function createQueuedSearch(opts: {
  userId: string;
  criteria: SearchCriteria;
  name?: string;
  profileId?: string | null;
}): Promise<SearchIntakeResult> {
  const compiled = compileCriteria(opts.criteria);
  if (!compiled.ok) return { ok: false, error: compiled.error, runId: "", discovered: 0 };
  const icpGate = compiled.criteria.prompt
    ? blockingIssue(compileIcp(compiled.criteria.prompt, compiled.criteria).issues)
    : null;
  if (icpGate) return { ok: false, error: icpGate.message, runId: "", discovered: 0 };

  const s = await scoped({ userId: opts.userId });
  const sql = s.sql;
  const userId = s.uid;
  const fp = queryFingerprint(compiled.criteria);
  const label = boundedString(opts.name, 80) || searchLabel(compiled.criteria);

  const recent = await sql`
    select id, status from search_runs
    where user_id = ${userId}
      and query_fingerprint = ${fp}
      and created_at > now() - interval '20 seconds'
      and status in ('queued','running')
    order by created_at desc limit 1`;
  if (recent[0]) {
    dispatchVercelExecution({ userId, runId: recent[0].id, reason: "search.reuse" });
    return { ok: true, runId: recent[0].id, discovered: 0, reused: true, state: "QUEUED" };
  }

  const cost = queryCost("search");
  const quota = await assertSearchQuota(sql, userId, cost);
  if (!quota.ok) return { ok: false, error: quota.error, runId: "", discovered: 0 };
  const companiesQuota = await assertCompanyQuota(sql, userId);
  if (!companiesQuota.ok) {
    await refundSearchQuota(sql, userId, cost);
    return { ok: false, error: companiesQuota.error, runId: "", discovered: 0 };
  }

  const t0 = Date.now();
  const runId = nid();
  const trace = startTrace(runId);
  const parseStage = markStage(trace, "parse");
  endStage(parseStage, { recordCount: 1 });
  try {
    await sql`insert into search_runs (id, user_id, profile_id, status, criteria, query_fingerprint, ranking_version, name, created_by_user_id, correlation_id)
      values (${runId}, ${userId}, ${opts.profileId ?? null}, ${"queued"}, ${JSON.stringify(compiled.criteria)}::jsonb, ${fp}, ${RANKING_VERSION}, ${label}, ${s.actor}, ${trace.correlationId})`;
  } catch {
    await sql`insert into search_runs (id, user_id, profile_id, status, criteria)
      values (${runId}, ${userId}, ${opts.profileId ?? null}, ${"queued"}, ${JSON.stringify(compiled.criteria)}::jsonb)`;
  }
  await enqueueJob(sql, userId, "discover", { runId });
  try { await audit(sql, userId, "search.start", "search_run", runId, { name: label, fingerprint: fp }); } catch { /* optional */ }
  dispatchVercelExecution({ userId, runId, reason: "search.start" });
  return { ok: true, runId, discovered: 0, state: "QUEUED", createdMs: Date.now() - t0 };
}

export async function latestSearchId(userId: string): Promise<string | null> {
  const s = await scoped({ userId });
  const rows = await s.sql<{ id: string }>`
    select id from search_runs
    where user_id = ${s.uid} and created_at > now() - interval '2 minutes'
    order by created_at desc limit 1`;
  return rows[0]?.id ?? null;
}
