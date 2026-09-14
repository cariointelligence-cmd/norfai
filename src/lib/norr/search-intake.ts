import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import type { SearchCriteria } from "./types.ts";
import { compileCriteria } from "./filter-dsl.ts";
import { boundedString } from "./security.ts";
import { queryFingerprint, searchLabel } from "./fingerprint.ts";
import { dispatchVercelExecution, kickSiblingDrain } from "./vercel-executor.ts";

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

  const sql = await getSql();

  const userId = opts.userId;
  const fp = queryFingerprint(compiled.criteria);
  const label = boundedString(opts.name, 80) || searchLabel(compiled.criteria);
  const t0 = Date.now();

  try {
    const recent = await sql<{ id: string }>`
      select id from search_runs
      where user_id = ${userId}
        and query_fingerprint = ${fp}
        and created_at > now() - interval '20 seconds'
        and status in ('queued','running')
      order by created_at desc limit 1`;
    if (recent[0]) {
      await kickSiblingDrain({ userId, runId: recent[0].id, reason: "search.reuse" }, 80);
      return { ok: true, runId: recent[0].id, discovered: 0, reused: true, state: "QUEUED", createdMs: Date.now() - t0 };
    }
  } catch { /* fingerprint column may be missing */ }

  const runId = nid();
  const jobId = nid();
  try {
    await sql`insert into search_runs (id, user_id, profile_id, status, criteria, query_fingerprint, name)
      values (${runId}, ${userId}, ${opts.profileId ?? null}, ${"queued"}, ${JSON.stringify(compiled.criteria)}::jsonb, ${fp}, ${label})`;
  } catch {
    await sql`insert into search_runs (id, user_id, status, criteria)
      values (${runId}, ${userId}, ${"queued"}, ${JSON.stringify(compiled.criteria)}::jsonb)`;
  }
  await sql`insert into jobs (id, user_id, run_id, type, payload, status)
    values (${jobId}, ${userId}, ${runId}, ${"discover"}, '{}'::jsonb, ${"queued"})`;
  await kickSiblingDrain({ userId, runId, reason: "search.start" }, 80);
  dispatchVercelExecution({ userId, runId, reason: "search.start" }, { http: false });
  return { ok: true, runId, discovered: 0, state: "QUEUED", createdMs: Date.now() - t0 };
}

export async function latestSearchId(userId: string): Promise<string | null> {
  const sql = await getSql();
  try { await sql.query("SET statement_timeout TO 1500"); } catch { /* */ }
  const rows = await sql<{ id: string }>`
    select id from search_runs
    where user_id = ${userId} and created_at > now() - interval '2 minutes'
    order by created_at desc limit 1`;
  return rows[0]?.id ?? null;
}
